#!/usr/bin/env node
/* Debug: dumpt den layouttreuen pdf.js-Text EINES PDFs (1:1 wie validate.js/Template).
 * Nutzung: node test/dump.js <pdf>   (2>/dev/null gegen Font-Warnungen)
 * Nur Entwicklungshilfe zum Tunen — nicht Teil des ausgelieferten Tools.
 */
const fs = require("node:fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
	"pdfjs-dist/legacy/build/pdf.worker.js",
);

async function pdfToText(buf) {
	const doc = await pdfjsLib.getDocument({
		data: buf,
		useWorkerFetch: false,
		isEvalSupported: false,
	}).promise;
	let text = "";
	for (let p = 1; p <= Math.min(doc.numPages, 14); p++) {
		const tc = await (await doc.getPage(p)).getTextContent();
		const lm = new Map();
		for (const it of tc.items) {
			if (!it.str || !it.transform) continue;
			const k = Math.round(it.transform[5] / 2) * 2;
			if (!lm.has(k)) lm.set(k, []);
			lm.get(k).push({ x: it.transform[4], s: it.str });
		}
		text += `===== Seite ${p} =====\n`;
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
	return text;
}

(async () => {
	const f = process.argv[2];
	if (!f) {
		console.error("Nutzung: node test/dump.js <pdf>");
		process.exit(1);
	}
	process.stdout.write(await pdfToText(new Uint8Array(fs.readFileSync(f))));
})();
