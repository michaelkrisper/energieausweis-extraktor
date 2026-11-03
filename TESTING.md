# Testing

The shipped `dist/index.html` runs on pdf.js in the browser. The test harness uses the **same
pdf.js** and the **same engine**: `test/engine.js` evaluates the engine block straight from
`src/app.template.html` (from `const NUM_KEYS` up to `// ---- State`), so there is no duplicated
rule set and no drift between browser and tests.

## Setup

```bash
npm install            # pdfjs-dist (test harness) and Biome; nothing of this is shipped
node test/fetch.js     # download the corpus PDFs into test/samples/ (gitignored)
```

The corpus PDFs are third-party certificates and are not committed. Each fixture carries the
source URL (`_quelle`) and checksum (`_sha256`); `fetch.js` verifies the checksum. Fixtures whose
source is no longer reachable are reported by `validate.js` as "Fixture without PDF" and can only
be checked locally.

## Unit tests

```bash
npm test               # node --test "test/unit/*.test.js"
```

Synthetic inputs only (no third-party PDFs): number parsing, line grouping (tolerance, shift
invariance, overprint removal), certificate detection, label extraction, class bounds,
plausibility checks, mojibake and number-format repair, a hand-built PDF through `pdfToText`, and
consistency checks (numeric keys are columns, the vendored pdf.js equals the tested version, the
inline app script compiles).

## Corpus validation

```bash
node test/validate.js test/samples 2>/dev/null           # reference corpus
node test/validate.js /path/to/own/pdfs 2>/dev/null      # any folder
```

Two modes, chosen per PDF:

- **Assert mode** (`<pdf>.expected.json` exists): compares every field against the hand-read
  expected value. Output per PDF `✓/✗  n/m PASS`, deviations as `FAIL` (wrong value) or `MISS`
  (expected value, nothing extracted), then a total. Exit code ≠ 0 on any FAIL or MISS.
- **Coverage mode** (no fixture): field coverage and the main values only — useful as a first
  look at a new layout.

Regressions:

```bash
node test/validate.js test/samples --baseline   # store PASS counts as test/baseline.json
node test/validate.js test/samples              # later runs print "Δ vs baseline" per PDF
```

Robustness against print variations (metamorphic jitter test, part of CI):

```bash
node test/validate.js test/samples --jitter      # 3 extra runs per PDF: page offset ±0.5–1 in x/y,
node test/validate.js test/samples --jitter=5    # item x noise ±0.3, neighbour swaps in item order;
                                                 # every field must stay identical
```

Debug a single PDF (layout text exactly as the engine sees it):

```bash
node test/dump.js test/samples/<file>.pdf 2>/dev/null
```

pdf.js prints harmless font warnings to stderr (`standardFontDataUrl`, `Cannot polyfill
DOMMatrix`); `2>/dev/null` hides them.

## Writing a fixture

Read the PDF by hand (or from `dump.js`, never from the extractor output) and store the real
values as `<pdf>.expected.json` next to it, with `_quelle` (direct URL) and `_sha256`. Only add
fields that are actually printed; a field printed empty ("---", "-", "k.A.") is asserted as `""`,
an omitted key is not checked. Numbers in point notation, dates as `DD.MM.YYYY`. Keys starting
with `_` are metadata and not checked. Field keys are the column keys in `COLUMNS` of the
template (German domain terms of the OIB forms, e.g. `bezugsflaeche`, `seehoehe`).

## Adding a new certificate layout

1. Add the fixture (see above), run `node test/fetch.js` and `node test/validate.js test/samples`.
2. A field is missing or wrong → adjust the matching `byLabel` / `byGerman` / `byAbbrAdjacent` /
   regex in `extract()` in `src/app.template.html`.
3. `python3 build.py`, then validation (including `--jitter`) and `npm test` must stay green.

New engine rules are derived from the corpus; whether they generalise only shows on unseen
documents. Before taking new fixtures into the corpus, write them by hand without running the
extractor on them first, measure the hit rate, and only then fix the gaps.

By design, scanned PDFs (no text layer) are marked `MANUELL` (no OCR), and unclear layouts yield
an empty cell rather than a wrong number.
