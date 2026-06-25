#!/usr/bin/env node
/*
 * Validierungs-Harness — prüft die Extraktion gegen echte PDFs auf dem ENTWICKLER-Rechner.
 * Nutzt denselben pdf.js-Pfad und dieselbe extract()-Logik wie dist/index.html, damit das
 * Ergebnis dem Browser-Verhalten entspricht.
 *
 *   npm i pdfjs-dist@3.11.174        # einmalig (nur Dev-Maschine, nicht der Firmen-PC)
 *   node test/validate.js <ordner-mit-pdfs>     # default: test/samples
 *
 * Gibt pro PDF: ist-Energieausweis?, Feld-Abdeckung und die wichtigsten Werte.
 */
const fs = require("node:fs");
const path = require("node:path");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
	"pdfjs-dist/legacy/build/pdf.worker.js",
);

// extract()/isEnergieausweis() direkt aus dem Template ziehen (keine Code-Duplikation/Drift)
const tpl = fs.readFileSync(
	path.join(__dirname, "..", "src", "app.template.html"),
	"utf8",
);
// eslint-disable-next-line no-eval
eval(tpl.slice(tpl.indexOf("const NUM_KEYS"), tpl.indexOf("// ---- State")));

// pdfToText 1:1 wie im Template (Zeilen-Rekonstruktion aus 2D-Positionen)
async function pdfToText(buf) {
	const doc = await pdfjsLib.getDocument({
		data: buf,
		useWorkerFetch: false,
		isEvalSupported: false,
	}).promise;
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
	await doc.destroy();
	return { text, pages };
}

const FIELDS = [
	"ausgabe",
	"plz_ort",
	"kg",
	"kategorie",
	"baujahr",
	"bgf",
	"hwb",
	"hwb_sk",
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

(async () => {
	const dir = process.argv[2] || path.join(__dirname, "samples");
	if (!fs.existsSync(dir)) {
		console.error(`Ordner nicht gefunden: ${dir}`);
		process.exit(1);
	}
	const pdfs = fs
		.readdirSync(dir)
		.filter((f) => f.toLowerCase().endsWith(".pdf"));
	if (!pdfs.length) {
		console.error(`Keine PDFs in ${dir}`);
		process.exit(1);
	}
	console.log(`${pdfs.length} PDF(s) in ${dir}\n`);
	for (const f of pdfs) {
		let line = `${f.slice(0, 32).padEnd(34)}`;
		try {
			const { text } = await pdfToText(
				new Uint8Array(fs.readFileSync(path.join(dir, f))),
			);
			if (!isEnergieausweis(text)) {
				console.log(`${line} ÜBERSPRUNGEN (kein Energieausweis)`);
				continue;
			}
			const r = extract(text);
			const cov = FIELDS.filter((k) => r[k]).length;
			line += `EA  ${String(cov).padStart(2)}/${FIELDS.length} Felder  `;
			line += `hwb=${r.hwb || "·"} fgee=${r.fgee || "·"} ausgabe="${r.ausgabe || "·"}" ${r.plz_ort || ""}`;
			console.log(line);
		} catch (e) {
			console.log(`${line} FEHLER: ${e.message}`);
		}
	}
})();
