# Energieausweis-Extraktor

Offline browser tool that reads Austrian energy performance certificates (*Energieausweis*, OIB
guideline RL 6) as PDFs from a folder tree, extracts their key figures and exports them as one
normalised Excel sheet.

[![CI](https://github.com/michaelkrisper/energieausweis-extraktor/actions/workflows/ci.yml/badge.svg)](https://github.com/michaelkrisper/energieausweis-extraktor/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/michaelkrisper/energieausweis-extraktor?sort=semver&label=version)](https://github.com/michaelkrisper/energieausweis-extraktor/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-339933.svg)](.nvmrc)
[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f.svg)](https://michaelkrisper.github.io/energieausweis-extraktor/)

**Live demo: <https://michaelkrisper.github.io/energieausweis-extraktor/>**

Everything runs locally in the browser: no server, no upload, no installation. The page is a
single self-contained HTML file and keeps working offline. The user interface is in German, the
language of the documents it processes.

## Features

- Recursive folder scan (folder picker or drag and drop); by default only subtrees whose folder
  name contains `ENERGIE`; PDFs that are not certificates are skipped automatically.
- Tested on OIB editions 2011 to 2023 (residential, non-residential and "other conditioned"
  buildings); the September 2025 edition is recognised (checked against the official sample). Tested with GEQ, ArchiPHYSIK, ECOTECH/BuildDesk, ETU
  Gebäudeprofi, AX3000/Allplan, eawz (Vorarlberg), MA 39 Vienna and others.
- One column set for all editions: HWB / HWB Ref / EEB / PEB / CO2 / fGEE in site and reference
  climate, OIB 2015+ key-figure blocks, building geometry, location, systems, dates, issuer.
- Plausibility checks (BF = 0.8·BGF, A/V, PEB = non-renewable + renewable, class letter on the
  cover page vs. extracted value, date ranges …) flag rows for review and never overwrite values.
- Editable, sortable result table; `.xlsx` export with autofilter and real numbers.
- No OCR by design: scanned PDFs and unclear layouts are marked for manual entry instead of
  guessed.

## Usage

Open the [live demo](https://michaelkrisper.github.io/energieausweis-extraktor/), or download
[`dist/index.html`](dist/index.html) and open it with a double click.

1. Click **„Ordner wählen"** (choose folder) or drop folders / PDFs onto the window. The toggle
   **„nur ‚ENERGIE'-Ordner"** lifts the folder-name filter. A running scan can be cancelled; the
   partial result is kept.
2. Review the table. Every cell is editable (edited cells are highlighted). Click a column header
   to sort; empty columns are hidden unless **„leere Spalten ausblenden"** is unticked.
3. **„Excel exportieren"** writes the `.xlsx` (always with all columns).

Status column:

| Status | Meaning |
|---|---|
| `OK · n Kennzahlen` | extracted, *n* energy key figures found |
| `PRÜFEN · …` | values extracted, but a plausibility check or the cover-page class disagrees; review the row |
| `MANUELL · kein Text (Scan?)` | no text layer (scanned); enter by hand |
| `MANUELL · Kennzahlen nicht gefunden` | layout not recognised |
| `MANUELL · passwortgeschützt` / `Lesefehler` | file cannot be read |

Chromium-based browsers (Chrome, Edge) get the File System Access API (folder picker and folder
drag and drop). Firefox and Safari fall back to `<input webkitdirectory>`.

## How it works

1. **Text layout.** pdf.js returns positioned text items. `groupLines()` groups them into lines
   with a shift-invariant baseline tolerance (`LINE_TOL` = 1.25 units), drops overprinted
   duplicate glyphs and sorts by x; gaps wider than ~14 units become column separators. Each text
   line keeps its real item positions (`linePos`).
2. **Normalisation.** Length-preserving repairs on text and positions: MacRoman mojibake from
   Ghostscript print paths, English number format, Unicode minus, `kWh/m2a`.
3. **Extraction.** `extract()` fills one value per field from label cells, abbreviations and
   climate-column headers. Where position data is available, the column is resolved by x position
   (the actual value sits right of the abbreviation, the requirement left of it; `…,zul`
   subscripts mark limits). A dedicated path reads ArchiPHYSIK 2019 forms whose labels are
   vector graphics only. Each field has a plausibility range.
4. **Classes and checks.** Missing efficiency classes are computed from the normative OIB RL 6
   bounds; class letters printed on the cover page are cross-checked against the extracted
   values.

Only the first 14 pages of a PDF are read. The extraction is heuristic: review values before
using them.

## Development

Requirements: Node.js ≥ 22.13 (CI uses the version in [`.nvmrc`](.nvmrc)) and Python ≥ 3.12.

```bash
npm install                     # dev dependencies: pdfjs-dist (test harness), Biome
pip install -r requirements-dev.txt   # Ruff

python3 build.py                # src/app.template.html + vendor/*.js -> dist/index.html
npm run lint                    # Biome (JS) — and: ruff check . && ruff format --check .
npm test                        # unit tests (node --test, synthetic inputs)
node test/fetch.js              # download the reference corpus PDFs (URL + sha256 per fixture)
node test/validate.js test/samples --jitter 2>/dev/null   # corpus assertions + jitter test
node test/dump.js <file.pdf> 2>/dev/null                  # layout text exactly as the engine sees it
```

Project layout:

| Path | Content |
|---|---|
| `src/app.template.html` | the whole application: UI and extraction engine |
| `vendor/` | pdf.js 6.5.438 (ES module + worker) and SheetJS 0.20.3, committed for an offline, reproducible build |
| `dist/index.html` | generated single-file build (committed; CI checks it is up to date) |
| `test/engine.js` | loads the engine block directly from the template, so tests and browser share one implementation |
| `test/unit/` | unit tests |
| `test/samples/` | hand-read fixtures (`*.expected.json`) for 81 real certificates; the PDFs are third-party documents and are only referenced by URL and sha256 |

The reference corpus must stay at 100 % in assert mode, and the jitter test (every PDF re-read
with shifted pages, x noise and swapped item order) must yield identical results. See
[TESTING.md](TESTING.md) for the test harness and how to add a new certificate layout.

CI ([`ci.yml`](.github/workflows/ci.yml)) runs lint, unit tests, the corpus validation and the
build check on every push and pull request to `main`; GitHub Pages is deployed only after CI
passes. Every merge to `main` is tagged with the next patch version; bundled releases with
release notes come from the Release workflow. Changes go through issues and pull requests, see
[CONTRIBUTING](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Michael Krisper. Bundled libraries: pdf.js (Apache-2.0), SheetJS Community
Edition (Apache-2.0).
