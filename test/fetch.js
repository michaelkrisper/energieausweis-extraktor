#!/usr/bin/env node
/*
 * Lädt die Korpus-PDFs nach test/samples/ (gitignored). Die Ausweise sind öffentlich verlinkt,
 * aber nicht unsere — ins Repo kommt je PDF nur die handgelesene Fixture mit `_quelle` (URL)
 * und `_sha256`. Bereits vorhandene PDFs mit passender Prüfsumme werden nicht neu geladen.
 *
 *   node test/fetch.js
 *
 * Nicht erreichbar oder Prüfsumme geändert → Warnung, kein Abbruch: validate.js meldet die
 * Fixture dann als „ohne PDF", der Rest des Korpus bleibt prüfbar.
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
		const { _quelle, _sha256: want } = JSON.parse(
			fs.readFileSync(path.join(dir, f), "utf8"),
		);
		// _quelle trägt teils eine Notiz hinter der URL
		const url = _quelle?.split(/\s/)[0];
		const file = path.join(dir, `${name}.pdf`);
		if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === want) continue;
		try {
			if (!url || !want) throw new Error("_quelle/_sha256 fehlt in der Fixture");
			const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			const got = sha256(buf);
			if (got !== want) throw new Error(`Prüfsumme geändert (${got.slice(0, 12)}…)`);
			fs.writeFileSync(file, buf);
			console.log(`geladen  ${name}`);
		} catch (e) {
			missing++;
			console.warn(`WARNUNG  ${name}: ${e.message} — ${url}`);
		}
	}
	console.log(`${fixtures.length - missing}/${fixtures.length} PDFs vorhanden`);
})();
