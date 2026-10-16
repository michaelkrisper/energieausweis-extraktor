#!/usr/bin/env node
/* Debug: dumpt den layouttreuen pdf.js-Text EINES PDFs (1:1 wie validate.js/Template).
 * Nutzung: node test/dump.js <pdf>   (2>/dev/null gegen Font-Warnungen)
 * Nur Entwicklungshilfe zum Tunen — nicht Teil des ausgelieferten Tools.
 */
const fs = require("node:fs");
const path = require("node:path");
// Zeilenbildung (groupLines) aus dem Engine-Block des Templates — wie validate.js
const tpl = fs.readFileSync(path.join(__dirname, "..", "src", "app.template.html"), "utf8");
// eslint-disable-next-line no-eval
eval(tpl.slice(tpl.indexOf("const NUM_KEYS"), tpl.indexOf("// ---- State")));
// pdf.js 6 ist ESM -> dynamisch importieren (wie validate.js)
let pdfjsLib;
async function initPdfjs() {
	pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
	pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
		"pdfjs-dist/legacy/build/pdf.worker.min.mjs",
	);
}

async function pdfToText(buf) {
	const task = pdfjsLib.getDocument({
		data: buf,
		useWorkerFetch: false,
		isEvalSupported: false,
	});
	const doc = await task.promise;
	let text = "";
	for (let p = 1; p <= Math.min(doc.numPages, 14); p++) {
		const tc = await (await doc.getPage(p)).getTextContent();
		const items = [];
		for (const it of tc.items) {
			if (!it.str || !it.transform) continue;
			items.push({ x: it.transform[4], y: it.transform[5], s: it.str });
		}
		text += `===== Seite ${p} =====\n`;
		for (const parts of groupLines(items)) {
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
	return text;
}

(async () => {
	const f = process.argv[2];
	if (!f) {
		console.error("Nutzung: node test/dump.js <pdf>");
		process.exit(1);
	}
	await initPdfjs();
	process.stdout.write(await pdfToText(new Uint8Array(fs.readFileSync(f))));
})();
