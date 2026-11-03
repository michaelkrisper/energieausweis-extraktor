#!/usr/bin/env node
/*
 * Debug helper: dumps the layout-preserving pdf.js text of ONE PDF, exactly as the engine
 * sees it (same pdfToText as validate.js and the template), with a header per page.
 *
 *   node test/dump.js <pdf> 2>/dev/null     # 2>/dev/null hides pdf.js font warnings
 */
const fs = require("node:fs");
const { pdfToText } = require("./engine");

(async () => {
	const f = process.argv[2];
	if (!f) {
		console.error("Usage: node test/dump.js <pdf>");
		process.exit(1);
	}
	const { text, linePos } = await pdfToText(new Uint8Array(fs.readFileSync(f)));
	// linePos is 1:1 with the text lines; an empty `parts` marks the end of a page.
	let out = "",
		page = 0;
	text.split("\n").forEach((line, i) => {
		const lp = linePos[i];
		if (!lp) return;
		if (lp.page !== page) {
			page = lp.page;
			out += `===== Page ${page} =====\n`;
		}
		out += `${line}\n`;
	});
	process.stdout.write(out);
})();
