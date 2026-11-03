/*
 * Loads the extraction engine straight from src/app.template.html (the slice between
 * `const NUM_KEYS` and `// ---- State`), so the browser app and every Node tool run the
 * very same code — no duplicated rules, no drift. Also provides pdfToText(), the line
 * reconstruction from pdf.js text positions, identical to the template's version.
 */
const fs = require("node:fs");
const path = require("node:path");

const TEMPLATE = path.join(__dirname, "..", "src", "app.template.html");
const tpl = fs.readFileSync(TEMPLATE, "utf8");
const src = tpl.slice(tpl.indexOf("const NUM_KEYS"), tpl.indexOf("// ---- State"));
const EXPORTS = [
	"NUM_KEYS",
	"METRIC_KEYS",
	"LINE_TOL",
	"cleanNum",
	"cells",
	"groupLines",
	"isEnergyCertificate",
	"extract",
];
const engine = new Function(`${src}\nreturn { ${EXPORTS.join(", ")} };`)();

// pdf.js 6 is ESM -> import lazily, once.
let pdfjsLib;
async function pdfjs() {
	if (!pdfjsLib) {
		pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
		pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
			"pdfjs-dist/legacy/build/pdf.worker.min.mjs",
		);
	}
	return pdfjsLib;
}

// Same as pdfToText in the template. `tweak(items, page)` may perturb the raw pdf.js
// items (jitter test). Returns the layout-preserving text plus linePos, 1:1 with its lines.
async function pdfToText(buf, tweak) {
	const task = (await pdfjs()).getDocument({
		data: buf,
		useWorkerFetch: false,
		isEvalSupported: false,
	});
	const doc = await task.promise;
	const pages = doc.numPages;
	let text = "";
	const linePos = [];
	for (let p = 1; p <= Math.min(pages, 14); p++) {
		const tc = await (await doc.getPage(p)).getTextContent();
		const items = [];
		for (const it of tweak ? tweak(tc.items, p) : tc.items) {
			if (!it.str || !it.transform) continue;
			items.push({ x: it.transform[4], y: it.transform[5], w: it.width || 0, s: it.str });
		}
		for (const parts of engine.groupLines(items)) {
			let line = "",
				lastX = null;
			for (const pt of parts) {
				if (lastX !== null && pt.x - lastX > 14) line += "  ";
				line += pt.s;
				lastX = pt.x + pt.s.length * 5;
			}
			text += `${line}\n`;
			const y = Math.max(...parts.map((q) => q.y));
			linePos.push({ page: p, y, parts });
		}
		text += "\n";
		linePos.push({ page: p, parts: [] });
	}
	await task.destroy();
	return { text, pages, linePos };
}

module.exports = { ...engine, pdfToText, TEMPLATE };
