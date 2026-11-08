# CLAUDE.md

Guidance for Claude sessions in this repository.

## What this is

Offline single-file browser tool: reads Austrian energy performance certificates
(_Energieausweis_, OIB RL 6) as PDFs from a folder tree, extracts their key figures
heuristically and exports one normalised Excel sheet. No server, no upload:
`dist/index.html` is self-contained (pdf.js and SheetJS inlined) and is deployed to
GitHub Pages by CI. UI, status texts and field keys are German (the language of the
documents); code comments, docs and tests are English.

## Commands

Node >= 22.13 (CI: `.nvmrc`), Python >= 3.12 (CI: `.python-version`).

```sh
npm install                          # pdfjs-dist + Biome (dev only). No lockfile committed: never npm ci
pip install -r requirements-dev.txt  # ruff
python3 build.py                     # src/app.template.html + vendor/* -> dist/index.html
npm test                             # node --test "test/unit/*.test.js", synthetic inputs only
npx biome ci .                       # JS/JSON lint + format check; `npm run format` fixes
ruff check . && ruff format --check .
node test/fetch.js                   # download corpus PDFs (URL + sha256 from the fixtures)
node test/validate.js test/samples --jitter 2>/dev/null    # corpus assertions + jitter test (CI gate)
node test/validate.js test/samples --baseline 2>/dev/null  # store PASS counts in test/baseline.json
node test/dump.js test/samples/<file>.pdf 2>/dev/null      # layout text exactly as the engine sees it
```

- `2>/dev/null` only hides harmless pdf.js font warnings.
- CI (`.github/workflows/ci.yml`): lint, unit tests, fetch + validate `--jitter`, and
  `python3 build.py && git diff --exit-code -- dist/index.html`; on `main` then the
  version tag and the Pages deploy. Biome covers `test/**/*.js` and root JSON only, not
  the template or markdown.
- Harness details and the "new layout" recipe: TESTING.md.

## Architecture

- `src/app.template.html` -- the whole app, UI and extraction engine. Source of truth.
- `dist/index.html` -- generated: `build.py` replaces placeholder comments
  (`<!--__PDFJS__-->` etc.) with the `vendor/` files. Never edit it; rebuild and commit
  it with every template change, CI fails on a stale build.
- `vendor/` -- pdf.js (ES module + worker, embedded as `type="text/plain"` blocks that
  become Blob URLs at runtime) and SheetJS, committed for an offline, reproducible
  build. A unit test requires the vendored pdf.js to equal the pinned `pdfjs-dist`
  version: bump both together.
- `test/engine.js` -- evaluates the engine block of the template (slice from
  `const NUM_KEYS` to `// ---- State`), so browser and tests run the same code. It also
  holds the Node copy of `pdfToText`. `validate.js` and `dump.js` build on it.
- Pipeline: `pdfToText` (pdf.js items -> `groupLines` -> layout text plus `linePos` with
  the real positions; first 14 pages only) -> length-preserving normalisation
  (MacRoman mojibake, English number format, Unicode minus, `kWh/m2a`) ->
  `extract(text, linePos)`, one value per field -> editable table -> `.xlsx`.
- `COLUMNS` is the union of all OIB editions (2011/2015/2019/2023); order = Excel order.
  Keep `NUM_KEYS` / `METRIC_KEYS` in sync when changing columns. Main columns (`hwb`,
  `eeb`, `peb`, `co2`, `fgee`) carry the site-climate (SK) value; reference-climate (RK)
  and Ref variants have their own columns.
- Folder scan: `walk()` yields PDFs only below folders matching `ENERGY_DIR_RE`
  (inherited downwards; a UI toggle lifts it), `isEnergyCertificate` skips other PDFs,
  `runScan()` is the one pipeline for picker, drag and drop and the
  `<input webkitdirectory>` fallback.

## Engine rules

- An empty cell or `MANUELL` beats a wrong number. No OCR: scanned PDFs are `MANUELL`.
- Plausibility checks and the cover-page class cross-check (`coverClasses`) only append
  to `r.reviewNote` (status `PRÜFEN · …`); never overwrite an extracted value. New rules
  must keep zero false alarms on the corpus; a document that contradicts itself is
  documented in its fixture's `_layout`.
- Positions beat ordinal guesses. Climate-column tables with the sub-header
  "spezifisch zonenbezogen spezifisch" resolve by x (`colValue`); there the FIRST
  "spezifisch" column is the reference climate, not the site climate. In requirement
  rows the actual value is right of the abbreviation and the limit left of it
  (`actualRight`); `…,zul` subscripts mark limits (`dropLimits`). Text heuristics are
  only the fallback when no `linePos` exists.
- `LINE_TOL` (1.25, in `groupLines`) sits in a gap of the corpus baseline offsets. Any
  change to it, `groupLines` or `pdfToText` needs the corpus at 100 % AND `--jitter`
  green. "More plausible" line reconstruction without corpus proof has been a
  regression before.
- `pdfToText` exists twice (template and `test/engine.js`): change both identically,
  otherwise the tests check old logic while the browser ships new logic (happened once,
  had to be reverted).
- Never move or rename the `const NUM_KEYS` / `// ---- State` markers: `test/engine.js`
  slices the engine between them.
- Class letters: printed letter from the cover page first, otherwise computed from the
  normative OIB RL 6 bounds. OIB RL 6 edition September 2025 (`OIB2025`): no fGEE, new
  A-G scale, so no computed classes and no band cross-check. Its new key figures have no
  columns yet; add them only once real certificates exist.
- New fields and their names follow the newest OIB forms (2019/2023); older layouts are
  served as a fallback and may stay empty.

## Corpus and fixtures

- Never commit PDFs: the corpus PDFs are third-party certificates (legal reasons;
  `test/samples/*.pdf` is gitignored). A fixture `test/samples/<name>.expected.json`
  carries only the source URL `_quelle` and `_sha256`; `test/fetch.js` downloads and
  verifies. Older PDFs remain in git history; do not rewrite it.
- The reference corpus must stay at 100 % in assert mode. Fixtures whose source URL is
  dead show up as "Fixture without PDF" and can only be checked locally. A local-only
  backup of those PDFs and a reserve pool of unused candidate certificates exist outside
  the repo (see CLAUDE.local.md if present).
- Write expected values by hand from the PDF or `dump.js` output, never from extractor
  output (that cements bugs). Only printed fields; printed empty ("---", "-", "k.A.")
  -> `""`; omitted key = not checked; dates `DD.MM.YYYY`; `_`-keys are metadata.
- `kategorie` has exactly three values: `Wohngebäude`, `Nichtwohngebäude`,
  `Sonstige konditionierte Gebäude`; assert it only if the form title is in the text
  layer. The detail goes to `nutzungsprofil`.
- Holdout before self-confirmation: after engine changes, take 6-10 unseen certificates
  (different software and federal states), write their fixtures by hand without running
  the extractor first, measure and report the hit rate, only then fix the gaps and move
  them into the corpus. Take them from the reserve pool.

## Workflow

- Every change starts with a GitHub issue. Branch `<issue>-<slug>` from `main`, open a
  PR with `Closes #<issue>`. Never push to `main` directly.
- PRs auto-merge (squash) once CI and the "Linked ticket" check pass; drafts are not merged.
- Versions exist only as git tags `vX.Y.Z`. Every merge to `main` tags the next patch;
  never edit version numbers in files. Minor/major releases: Actions -> Release.
- Merging to `main` deploys `dist/` to GitHub Pages automatically.
- Details: CONTRIBUTING.md.
