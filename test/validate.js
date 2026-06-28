#!/usr/bin/env node
/*
 * Validierungs-Harness — prüft die Extraktion gegen echte PDFs auf dem ENTWICKLER-Rechner.
 * Nutzt denselben pdf.js-Pfad und dieselbe extract()-Logik wie dist/index.html, damit das
 * Ergebnis dem Browser-Verhalten entspricht.
 *
 *   npm i pdfjs-dist@6.1.200         # einmalig (nur Dev-Maschine, nicht der Firmen-PC)
 *   node test/validate.js <ordner-mit-pdfs>     # default: test/samples
 *
 * Gibt pro PDF: ist-Energieausweis?, Feld-Abdeckung und die wichtigsten Werte.
 */
const fs = require("node:fs");
const path = require("node:path");
// pdf.js 6 ist ESM -> dynamisch importieren (initPdfjs() vor dem ersten getDocument awaiten)
let pdfjsLib;
async function initPdfjs() {
	pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
	pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
		"pdfjs-dist/legacy/build/pdf.worker.min.mjs",
	);
}

// extract()/isEnergieausweis() direkt aus dem Template ziehen (keine Code-Duplikation/Drift)
const tpl = fs.readFileSync(
	path.join(__dirname, "..", "src", "app.template.html"),
	"utf8",
);
// eslint-disable-next-line no-eval
eval(tpl.slice(tpl.indexOf("const NUM_KEYS"), tpl.indexOf("// ---- State")));

// pdfToText 1:1 wie im Template (Zeilen-Rekonstruktion aus 2D-Positionen)
async function pdfToText(buf) {
	const task = pdfjsLib.getDocument({
		data: buf,
		useWorkerFetch: false,
		isEvalSupported: false,
	});
	const doc = await task.promise;
	const pages = doc.numPages;
	let text = "";
	for (let p = 1; p <= Math.min(pages, 14); p++) {
		const tc = await (await doc.getPage(p)).getTextContent();
		const lm = new Map();
		for (const it of tc.items) {
			if (!it.str || !it.transform) continue;
			const k = Math.round(it.transform[5] / 2) * 2;
			if (!lm.has(k)) lm.set(k, []);
			lm.get(k).push({ x: it.transform[4], s: it.str });
		}
		for (const y of [...lm.keys()].sort((a, b) => b - a)) {
			const parts = lm.get(y).sort((a, b) => a.x - b.x);
			let line = "",
				lastX = null;
			for (const pt of parts) {
				if (lastX !== null && pt.x - lastX > 14) line += "  ";
				line += pt.s;
				lastX = pt.x + pt.s.length * 5;
			}
			text += `${line}\n`;
		}
		text += "\n";
	}
	await task.destroy();
	return { text, pages };
}

// Felder für den Coverage-Fallback (PDFs OHNE .expected.json)
const FIELDS = [
	"ausgabe",
	"plz_ort",
	"kg",
	"kategorie",
	"baujahr",
	"bgf",
	"hwb",
	"wwwb",
	"heb",
	"eeb",
	"peb",
	"co2",
	"fgee",
	"lek",
	"seehoehe",
	"heizgradtage",
	"norm_aussen",
	"aussteller",
];

// ---- Assert-Modus -----------------------------------------------------------
// Vergleicht extract()-Ist gegen handgelesene Soll-Werte aus <pdf>.expected.json.
// Keys mit "_"-Präfix sind Metadaten (Quelle/Ausgabe/Layout), keine Soll-Felder.
// Werte werden vor dem Vergleich normalisiert (Zahlenkomma->Punkt, Whitespace),
// damit "45,6" == "45.6" und "1 230" == "1230" als gleich gelten.

function norm(v) {
	let s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
	// reine Zahl (evtl. mit Tausendertrenner / Komma) auf Punkt-Form bringen
	const numlike = s.replace(/[ .](?=\d{3}\b)/g, ""); // 1.230 / 1 230 -> 1230
	if (/^-?\d+(?:[.,]\d+)?$/.test(numlike.replace(",", "."))) {
		let n = numlike.replace(",", ".");
		if (n.indexOf(".") > -1) n = n.replace(/0+$/, "").replace(/\.$/, ""); // 50.0 -> 50
		return n;
	}
	return s.toLowerCase();
}
const eq = (a, b) => norm(a) === norm(b);

function classify(expected, got) {
	const res = { PASS: [], FAIL: [], MISS: [], EXTRA: [] };
	for (const k of Object.keys(expected)) {
		if (k.startsWith("_")) continue;
		const soll = expected[k];
		const ist = got[k] || "";
		if (eq(soll, ist)) res.PASS.push(k);
		else if (!ist) res.MISS.push(`${k}: soll=${soll}`);
		else res.FAIL.push(`${k}: soll=${soll} ist=${ist}`);
	}
	return res;
}

function loadBaseline(p) {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

(async () => {
	await initPdfjs();
	const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
	const dir = args[0] || path.join(__dirname, "samples");
	const baselinePath = path.join(__dirname, "baseline.json");
	if (!fs.existsSync(dir)) {
		console.error(`Ordner nicht gefunden: ${dir}`);
		process.exit(1);
	}
	const pdfs = fs
		.readdirSync(dir)
		.filter((f) => f.toLowerCase().endsWith(".pdf"))
		.sort();
	if (!pdfs.length) {
		console.error(`Keine PDFs in ${dir}`);
		process.exit(1);
	}
	console.log(`${pdfs.length} PDF(s) in ${dir}\n`);

	let totPass = 0;
	let totFail = 0;
	let totMiss = 0;
	const perPdf = {}; // name -> PASS-Quote für Baseline-Δ
	let anyAssert = false;

	for (const f of pdfs) {
		const base = f.slice(0, 36).padEnd(38);
		let text;
		try {
			({ text } = await pdfToText(
				new Uint8Array(fs.readFileSync(path.join(dir, f))),
			));
		} catch (e) {
			console.log(`${base} FEHLER: ${e.message}`);
			continue;
		}
		if (!isEnergieausweis(text)) {
			console.log(`${base} ÜBERSPRUNGEN (kein Energieausweis)`);
			continue;
		}
		const r = extract(text);
		const expPath = path.join(dir, `${f.replace(/\.pdf$/i, "")}.expected.json`);

		if (fs.existsSync(expPath)) {
			anyAssert = true;
			const expected = JSON.parse(fs.readFileSync(expPath, "utf8"));
			const c = classify(expected, r);
			const n = c.PASS.length + c.FAIL.length + c.MISS.length;
			totPass += c.PASS.length;
			totFail += c.FAIL.length;
			totMiss += c.MISS.length;
			perPdf[f] = c.PASS.length;
			const ok = c.FAIL.length === 0 && c.MISS.length === 0;
			console.log(
				`${base}${ok ? "✓" : "✗"} ${String(c.PASS.length).padStart(2)}/${n} PASS` +
					(c.FAIL.length ? `  ${c.FAIL.length} FAIL` : "") +
					(c.MISS.length ? `  ${c.MISS.length} MISS` : ""),
			);
			for (const x of c.FAIL) console.log(`      FAIL  ${x}`);
			for (const x of c.MISS) console.log(`      MISS  ${x}`);
		} else {
			const cov = FIELDS.filter((k) => r[k]).length;
			console.log(
				`${base}EA  ${String(cov).padStart(2)}/${FIELDS.length} Felder (keine Fixture)  ` +
					`hwb=${r.hwb || "·"} fgee=${r.fgee || "·"} ausgabe="${r.ausgabe || "·"}" ${r.plz_ort || ""}`,
			);
		}
	}

	if (!anyAssert) return; // reiner Coverage-Lauf, kein Soll/Ist

	console.log(
		`\nGESAMT  ${totPass} PASS  ${totFail} FAIL  ${totMiss} MISS  ` +
			`(Quote ${((totPass / (totPass + totFail + totMiss)) * 100).toFixed(1)}%)`,
	);

	// --baseline: aktuelle PASS-Zahlen speichern. Sonst gegen Baseline diffen.
	if (flags.has("--baseline")) {
		fs.writeFileSync(baselinePath, JSON.stringify(perPdf, null, 2));
		console.log(`Baseline gespeichert -> ${baselinePath}`);
	} else {
		const prev = loadBaseline(baselinePath);
		if (prev) {
			const deltas = [];
			for (const f of Object.keys(perPdf)) {
				const d = perPdf[f] - (prev[f] ?? 0);
				if (d !== 0) deltas.push(`${d > 0 ? "+" : ""}${d} ${f}`);
			}
			console.log(
				deltas.length
					? `Δ vs Baseline: ${deltas.join(", ")}`
					: "Δ vs Baseline: unverändert",
			);
		}
	}

	process.exit(totFail > 0 ? 1 : 0);
})();
