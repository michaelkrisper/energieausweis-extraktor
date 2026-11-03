// Unit tests for the extraction engine (loaded from src/app.template.html via test/engine.js).
// Synthetic inputs only; the real-PDF corpus is covered by test/validate.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const e = require("../engine");

test("cleanNum normalises Austrian number formats", () => {
	for (const [raw, want] of [
		["45,6", "45.6"],
		["2.493,7", "2493.7"],
		["12 433", "12433"],
		["20.516", "20516"],
		["-10,5 °C", "-10.5"],
		["0,29 W/m²K", "0.29"],
		["1.5", "1.5"],
	])
		assert.equal(e.cleanNum(raw), want, raw);
});

test("cells splits on runs of two or more spaces", () => {
	assert.deepEqual(e.cells("  Heiztage  210 d   Seehöhe 560 m "), [
		"Heiztage",
		"210 d",
		"Seehöhe 560 m",
	]);
});

test("groupLines joins items within LINE_TOL and sorts by x", () => {
	const lines = e.groupLines([
		{ x: 200, y: 700, s: "b" },
		{ x: 100, y: 700 - e.LINE_TOL + 0.05, s: "a" },
		{ x: 100, y: 700 - e.LINE_TOL - 0.1, s: "c" },
	]);
	assert.deepEqual(
		lines.map((l) => l.map((i) => i.s)),
		[["a", "b"], ["c"]],
	);
});

test("groupLines drops overprinted duplicate glyphs (fake bold)", () => {
	const lines = e.groupLines([
		{ x: 50, y: 500, s: "HWB" },
		{ x: 50.2, y: 500.1, s: "HWB" },
		{ x: 90, y: 500, s: "45,6" },
	]);
	assert.deepEqual(
		lines[0].map((i) => i.s),
		["HWB", "45,6"],
	);
});

test("groupLines is invariant under a page offset", () => {
	const items = [700, 699.2, 690, 689.1, 680.5].flatMap((y, i) => [
		{ x: 10, y, s: `l${i}` },
		{ x: 300, y: y - 0.3, s: `r${i}` },
	]);
	const shape = (its) => e.groupLines(its).map((l) => l.map((i) => i.s).join(" "));
	for (const d of [-1, -0.5, 0.37, 1])
		assert.deepEqual(shape(items.map((i) => ({ ...i, y: i.y + d }))), shape(items));
});

test("isEnergyCertificate scores keywords", () => {
	assert.equal(e.isEnergyCertificate("ENERGIEAUSWEIS für Wohngebäude"), true);
	assert.equal(e.isEnergyCertificate("Heizwärmebedarf HWB 45,6 kWh/m²a"), true);
	assert.equal(e.isEnergyCertificate("Rechnung Nr. 4711\nBetrag 120,00 EUR"), false);
});

const cert = (hwb, fgee, extra = "") => `Energieausweis für Wohngebäude
OIB-Richtlinie 6  Ausgabe: April 2019
Brutto-Grundfläche (BGF)  150,0 m²  Heiztage  210 d
Kompaktheit (A/V)  0,65 1/m  Seehöhe  560 m
Heizgradtage  3.650 Kd  Norm-Außentemperatur  -13,5 °C
WÄRME- UND ENERGIEBEDARF (Standortklima)
Heizwärmebedarf  HWB SK  ${hwb} kWh/m²a
Gesamtenergieeffizienz-Faktor  fGEE  ${fgee}
${extra}`;

test("extract reads labelled values from layout text", () => {
	const r = e.extract(
		cert("45,6", "0,82", "Ausstellungsdatum  12.03.2021  Gültigkeitsdatum  11.03.2031"),
	);
	assert.equal(r.ausgabe, "April 2019");
	assert.equal(r.kategorie, "Wohngebäude");
	for (const [k, v] of Object.entries({
		bgf: "150.0",
		kompaktheit: "0.65",
		seehoehe: "560",
		heizgradtage: "3650",
		norm_aussen: "-13.5",
		heiztage: "210",
		hwb: "45.6",
		fgee: "0.82",
		ausstelldatum: "12.03.2021",
		gueltig_bis: "11.03.2031",
	}))
		assert.equal(r[k], v, k);
	assert.equal(r.reviewNote || "", "");
});

test("a date's year is not taken as postcode", () => {
	const r = e.extract(
		cert("45,6", "0,82", "Ausstellungsdatum  12.03.2021  Gültigkeitsdatum  11.03.2031"),
	);
	assert.equal(r.plz_ort, "");
	assert.equal(
		e.extract(cert("45,6", "0,82", "Objekt  Musterweg 3, 4020 Linz")).plz_ort,
		"4020 Linz",
	);
});

test("efficiency classes fall back to the normative OIB RL6 bounds", () => {
	for (const [hwb, hk, fgee, fk] of [
		["10,0", "A++", "0,55", "A++"],
		["10,1", "A+", "0,56", "A+"],
		["45,6", "B", "0,82", "A"],
		["250,0", "F", "4,00", "F"],
		["250,1", "G", "4,01", "G"],
	]) {
		const r = e.extract(cert(hwb, fgee));
		assert.equal(r.hwb_klasse, hk, `HWB ${hwb}`);
		assert.equal(r.fgee_klasse, fk, `fGEE ${fgee}`);
	}
});

test("plausibility checks flag but never overwrite", () => {
	let r = e.extract(cert("45,6", "0,82", "Bezugsfläche (BF)  100,0 m²"));
	assert.equal(r.bezugsflaeche, "100.0");
	assert.match(r.reviewNote, /BF\/BGF/);
	r = e.extract(
		cert("45,6", "0,82", "Ausstellungsdatum  12.03.2021  Gültigkeitsdatum  11.03.2041"),
	);
	assert.equal(r.gueltig_bis, "11.03.2041");
	assert.match(r.reviewNote, /Gültigkeit/);
});

test("out-of-range building data is rejected", () => {
	assert.equal(e.extract(cert("45,6", "0,82").replace("560 m", "56000 m")).seehoehe, "");
});

test("MacRoman mojibake from Ghostscript print paths is repaired", () => {
	const r = e.extract(`Energieausweis f¸r Wohngeb‰ude
Heizw‰rmebedarf  HWB SK  45,6 kWh/m≤a
ErstellerIn  Ing. Hans M¸ller
Katastralgemeinde  Gˆstling
`);
	assert.equal(r.kategorie, "Wohngebäude");
	assert.equal(r.hwb, "45.6");
	assert.equal(r.aussteller, "Ing. Hans Müller");
	assert.equal(r.kg, "Göstling");
});

test("English number format (decimal point) is detected and swapped", () => {
	const rows = Array.from({ length: 9 }, (_, i) => `Wert${i}  31${i}.3 kWh/m²a`).join("\n");
	const r = e.extract(
		`Energieausweis für Wohngebäude\nBrutto-Grundfläche  1,554.0 m²\n${rows}\nHeizwärmebedarf  HWB SK  45.6 kWh/m²a\n`,
	);
	assert.equal(r.bgf, "1554.0");
	assert.equal(r.hwb, "45.6");
});

test("every numeric key is a known column", () => {
	const tpl = fs.readFileSync(e.TEMPLATE, "utf8");
	const keys = new Set([...tpl.matchAll(/\{key:'(\w+)'/g)].map((m) => m[1]));
	for (const k of [...e.NUM_KEYS, ...e.METRIC_KEYS]) assert.ok(keys.has(k), k);
});

// Minimal hand-built PDF: one page, Helvetica text items at given positions.
function makePdf(items) {
	const stream = items.map(([x, y, s]) => `BT /F1 9 Tf ${x} ${y} Td (${s}) Tj ET`).join("\n");
	const objs = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	];
	let pdf = "%PDF-1.4\n";
	const offs = objs.map((o, i) => {
		const at = pdf.length;
		pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
		return at;
	});
	const xref = pdf.length;
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
	pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new Uint8Array(Buffer.from(pdf, "latin1"));
}

test("pdfToText rebuilds lines and column gaps from text positions", async () => {
	const { text, pages, linePos } = await e.pdfToText(
		makePdf([
			[50, 700, "Heizw\\344rmebedarf"],
			[250, 700.8, "45,6 kWh/m\\262a"],
			[50, 680, "fGEE"],
			[250, 680, "0,82"],
		]),
	);
	assert.equal(pages, 1);
	const lines = text.split("\n");
	assert.deepEqual(lines.slice(0, 2).map(e.cells), [
		["Heizwärmebedarf", "45,6 kWh/m²a"],
		["fGEE", "0,82"],
	]);
	assert.equal(linePos.length, text.split("\n").length - 1);
	assert.equal(linePos[0].y, 700.8);
	assert.equal(e.extract(text, linePos).hwb, "45.6");
});

test("vendored pdf.js matches the version the harness tests with", () => {
	const root = path.join(__dirname, "..", "..");
	const shipped = fs
		.readFileSync(path.join(root, "vendor", "pdf.min.mjs"), "utf8")
		.match(/"(\d+\.\d+\.\d+)"/)[1];
	const tested = require("pdfjs-dist/package.json").version;
	assert.equal(shipped, tested);
});

test("the whole inline app script compiles", () => {
	const tpl = fs.readFileSync(e.TEMPLATE, "utf8");
	const src = tpl.slice(tpl.indexOf("<script>\n") + 9, tpl.lastIndexOf("</script>"));
	assert.doesNotThrow(() => new Function(src));
});
