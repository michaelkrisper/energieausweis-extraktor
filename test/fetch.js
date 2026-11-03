#!/usr/bin/env node
/*
 * Downloads the corpus PDFs into test/samples/ (gitignored). The certificates are publicly
 * linked but not ours — the repo only holds the hand-read fixture per PDF, with `_quelle`
 * (source URL) and `_sha256`. PDFs already present with a matching checksum are skipped.
 *
 *   node test/fetch.js
 *
 * Unreachable or checksum changed -> warning, no abort: validate.js then reports the fixture
 * as "without PDF" and the rest of the corpus stays testable.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dir = path.join(__dirname, "samples");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

(async () => {
	const fixtures = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".expected.json"))
		.sort();
	let missing = 0;
	for (const f of fixtures) {
		const name = f.replace(/\.expected\.json$/, "");
		const { _quelle, _sha256: want } = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
		// _quelle sometimes carries a note after the URL
		const url = _quelle?.split(/\s/)[0];
		const file = path.join(dir, `${name}.pdf`);
		if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === want) continue;
		try {
			if (!url || !want) throw new Error("_quelle/_sha256 missing in fixture");
			const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			const got = sha256(buf);
			if (got !== want) throw new Error(`checksum changed (${got.slice(0, 12)}…)`);
			fs.writeFileSync(file, buf);
			console.log(`fetched  ${name}`);
		} catch (e) {
			missing++;
			console.warn(`WARNING  ${name}: ${e.message} — ${url}`);
		}
	}
	console.log(`${fixtures.length - missing}/${fixtures.length} PDFs present`);
})();
