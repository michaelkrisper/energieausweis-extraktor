#!/usr/bin/env node
/*
 * Validation harness: checks the extraction against real PDFs on the developer machine.
 * Uses the same pdf.js path and the same extract() logic as dist/index.html, so the result
 * matches the browser.
 *
 *   npm install                                  # once (dev machine only)
 *   node test/validate.js [dir] [--baseline] [--jitter[=N]]   # default dir: test/samples
 *
 * Per PDF: assert mode against <pdf>.expected.json if present, otherwise field coverage.
 * Exit code 1 on any FAIL, MISS or jitter deviation.
 */
const fs = require("node:fs");
const path = require("node:path");
const { extract, isEnergyCertificate, pdfToText } = require("./engine");

// Fields for coverage mode (PDFs WITHOUT .expected.json)
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

// ---- Assert mode ------------------------------------------------------------
// Compares extract() output with hand-read expected values from <pdf>.expected.json.
// Keys with a "_" prefix are metadata (source/edition/layout), not expected fields.
// Values are normalised before comparison (decimal comma -> point, whitespace),
// so "45,6" == "45.6" and "1 230" == "1230".

function norm(v) {
	const s = String(v == null ? "" : v)
		.replace(/\s+/g, " ")
		.trim();
	// plain number (possibly with thousands separator / comma) -> point form
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
		const want = expected[k];
		const have = got[k] || "";
		if (eq(want, have)) res.PASS.push(k);
		else if (!have) res.MISS.push(`${k}: expected=${want}`);
		else res.FAIL.push(`${k}: expected=${want} got=${have}`);
	}
	return res;
}

// ---- Jitter (metamorphic robustness test) ---------------------------------
// --jitter[=N]: read every PDF N more times (default 3) with deterministically
// shifted pdf.js items (seed = run + file name). Model (JMODE=page): whole page
// shifted by ±0.5…1 unit in x and y (other printer driver / page margin), per-item
// x noise ±JNX (0.3), random neighbour swaps in the item order. The result must
// equal the unshifted run field by field — otherwise a rule depends on a brittle
// threshold (line grid, column gap, window width). The hook sits in pdfToText
// (tweak); the line reconstruction itself is identical to the template. Per-item
// y noise (JNY) is deliberately off: EVERY line tolerance has baseline gaps right
// next to it (JNY=0.05: 1, JNY=0.15: 19 of 189 runs differ) — that measures the
// edge of LINE_TOL, not a rule. JMODE=item: independent noise ±JX/±JY per item.
const JX = Number(process.env.JX || 1);
const JY = Number(process.env.JY || 1);
function mulberry32(a) {
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function hashStr(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}
const JMODE = process.env.JMODE || "page";
const JNX = Number(process.env.JNX || 0.3);
const JNY = Number(process.env.JNY || 0);
function jitterTweak(seed, name) {
	const rnd = mulberry32(hashStr(name) ^ Math.imul(seed, 0x9e3779b1));
	const amp = (a) => (rnd() < 0.5 ? -1 : 1) * a * (0.5 + 0.5 * rnd()); // ±0.5a…a
	return (items) => {
		const px = amp(JX),
			py = amp(JY);
		const out = items.map((it) => {
			if (!it.transform) return it;
			const t = it.transform.slice();
			if (JMODE === "page") {
				t[4] += px + (rnd() * 2 - 1) * JNX;
				t[5] += py + (rnd() * 2 - 1) * JNY;
			} else {
				t[4] += (rnd() * 2 - 1) * JX;
				t[5] += (rnd() * 2 - 1) * JY;
			}
			return { ...it, transform: t };
		});
		for (let i = out.length - 1; i > 0; i--)
			if (rnd() < 0.3) [out[i], out[i - 1]] = [out[i - 1], out[i]];
		return out;
	};
}
function diffFields(a, b) {
	const out = [];
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
		if (!eq(a[k] || "", b[k] || "")) out.push(`${k}: ${a[k] || "·"} -> ${b[k] || "·"}`);
	return out;
}

function loadBaseline(p) {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

(async () => {
	const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
	const jflag = [...flags].find((a) => /^--jitter(?:=\d+)?$/.test(a));
	const jitterRuns = jflag ? Number(jflag.split("=")[1] || 3) : 0;
	let jitterDiffs = 0;
	const dir = args[0] || path.join(__dirname, "samples");
	const baselinePath = path.join(__dirname, "baseline.json");
	if (!fs.existsSync(dir)) {
		console.error(`Directory not found: ${dir}`);
		process.exit(1);
	}
	const pdfs = fs
		.readdirSync(dir)
		.filter((f) => f.toLowerCase().endsWith(".pdf"))
		.sort();
	if (!pdfs.length) {
		console.error(`No PDFs in ${dir}`);
		process.exit(1);
	}
	console.log(`${pdfs.length} PDF(s) in ${dir}\n`);
	const orphans = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".expected.json"))
		.filter((f) => !fs.existsSync(path.join(dir, f.replace(/\.expected\.json$/, ".pdf"))));
	for (const f of orphans) console.log(`Fixture without PDF (node test/fetch.js?): ${f}`);
	if (orphans.length) console.log("");

	let totPass = 0;
	let totFail = 0;
	let totMiss = 0;
	const perPdf = {}; // name -> PASS count for the baseline delta
	let anyAssert = false;

	for (const f of pdfs) {
		const base = f.slice(0, 36).padEnd(38);
		let text;
		let linePos;
		try {
			({ text, linePos } = await pdfToText(new Uint8Array(fs.readFileSync(path.join(dir, f)))));
		} catch (e) {
			console.log(`${base} ERROR: ${e.message}`);
			continue;
		}
		if (!isEnergyCertificate(text, linePos)) {
			console.log(`${base} SKIPPED (not an energy certificate)`);
			continue;
		}
		const r = extract(text, linePos);
		const expPath = path.join(dir, `${f.replace(/\.pdf$/i, "")}.expected.json`);
		const jit = [];
		for (let s = 1; s <= jitterRuns; s++) {
			const j = await pdfToText(
				new Uint8Array(fs.readFileSync(path.join(dir, f))),
				jitterTweak(s, f),
			);
			const d = diffFields(r, extract(j.text, j.linePos));
			if (d.length) jit.push(`      JITTER seed ${s}: ${d.join("; ")}`);
		}
		jitterDiffs += jit.length;

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
				`${base}EA  ${String(cov).padStart(2)}/${FIELDS.length} fields (no fixture)  ` +
					`hwb=${r.hwb || "·"} fgee=${r.fgee || "·"} ausgabe="${r.ausgabe || "·"}" ${r.plz_ort || ""}`,
			);
		}
		for (const x of jit) console.log(x);
	}

	if (jitterRuns)
		console.log(
			`\nJITTER  ${jitterRuns} runs per PDF (${JMODE === "page" ? `page offset ±${JX}/±${JY}, item x ±${JNX}, y ±${JNY}` : `item x ±${JX}, y ±${JY}`}): ` +
				(jitterDiffs ? `${jitterDiffs} runs with a different result` : "all results stable"),
		);
	if (!anyAssert) process.exit(jitterDiffs ? 1 : 0); // coverage-only run, nothing to assert

	console.log(
		`\nTOTAL  ${totPass} PASS  ${totFail} FAIL  ${totMiss} MISS  ` +
			`(rate ${((totPass / (totPass + totFail + totMiss)) * 100).toFixed(1)}%)`,
	);

	// --baseline: store the current PASS counts. Otherwise diff against the baseline.
	if (flags.has("--baseline")) {
		fs.writeFileSync(baselinePath, JSON.stringify(perPdf, null, 2));
		console.log(`Baseline saved -> ${baselinePath}`);
	} else {
		const prev = loadBaseline(baselinePath);
		if (prev) {
			const deltas = [];
			for (const f of Object.keys(perPdf)) {
				const d = perPdf[f] - (prev[f] ?? 0);
				if (d !== 0) deltas.push(`${d > 0 ? "+" : ""}${d} ${f}`);
			}
			console.log(
				deltas.length ? `Δ vs baseline: ${deltas.join(", ")}` : "Δ vs baseline: unchanged",
			);
		}
	}

	// MISS counts like FAIL: an expected field that is no longer extracted is the same
	// regression as a wrong value — otherwise the CI gate would be blind to it.
	process.exit(totFail > 0 || totMiss > 0 || jitterDiffs > 0 ? 1 : 0);
})();
