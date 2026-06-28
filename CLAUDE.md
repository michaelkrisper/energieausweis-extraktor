# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

Lokales Single-File-Browser-Tool: liest österreichische Energieausweis-PDFs rekursiv aus einem
Ordnerbaum, extrahiert OIB-Kennwerte heuristisch und exportiert sie vereinheitlicht nach Excel.
Komplett offline, kein Server, keine Daten verlassen den Rechner. Läuft nur in Chromium (Edge/Chrome)
— Firefox kann keine Ordner einlesen (File System Access API).

## Befehle

```bash
python3 build.py                             # src/app.template.html + vendor/*.js -> dist/index.html
npm install                                  # pdfjs-dist (nur Dev-Harness, NICHT ausgeliefert)
node test/validate.js test/samples 2>/dev/null         # Assert-Harness, Exit≠0 bei FAIL
node test/validate.js test/samples --baseline 2>/dev/null   # PASS-Stand als baseline.json sichern
node test/dump.js test/samples/<datei>.pdf 2>/dev/null  # layouttreuen pdf.js-Text eines PDFs dumpen
```

Kein Lint/Unit-Framework. „Test" = `validate.js`. Pro PDF mit `<name>.expected.json` läuft der
**Assert-Modus** (PASS/FAIL/MISS gegen handgelesene Soll-Werte, Exit-Code, `Δ vs Baseline`); ohne
Fixture nur Coverage. Der Referenz-Korpus in `test/samples/` (PDFs + Fixtures) ist **committet** und
muss grün bleiben (100 %). `2>/dev/null` blendet harmlose pdf.js-Font-Warnungen aus.

## Architektur

**Build-Modell (kritisch):** `dist/index.html` ist ein **generiertes Artefakt**, nicht editieren.
`build.py` inlinet die `vendor/*.js`-Libs (pdf.js, SheetJS, pdf.worker als `type="text/plain"`-Blob)
über Platzhalter-Kommentare (`<!--__PDFJS__-->` etc.) in `src/app.template.html`. Quelle ist immer
das Template; nach jeder Änderung `python3 build.py`. Die Libs liegen committet in `vendor/`, damit
der Build offline reproduzierbar ist.

**Eine Engine, zwei Aufrufer — kein Drift:** Die Extraktionslogik lebt nur in `src/app.template.html`.
`test/validate.js` dupliziert sie NICHT, sondern `eval()`t den Engine-Block direkt aus dem Template
(Slice `const NUM_KEYS` … `// ---- State`). Ändert man die Engine, ändern sich Browser **und** Test
gemeinsam. Die `pdfToText`-Zeilenrekonstruktion ist in beiden bewusst 1:1 identisch gehalten.

**Pipeline:** PDF → `pdfToText` rekonstruiert layouttreuen Text aus den 2D-Textpositionen von pdf.js
(Items nach y-Position zu Zeilen gruppiert, nach x sortiert; Lücken > ~14 Einheiten → Doppel-Leerzeichen).
→ `extract(text)` füllt pro Feld einen Wert. → editierbare HTML-Tabelle → SheetJS-Export (`.xlsx`,
Autofilter, echte Zahlen). Nur die ersten 14 Seiten werden gelesen.

**Engine-Kern (`src/app.template.html`):**
- `COLUMNS` — Spaltensatz = **Vereinigungsmenge aller OIB-Ausgaben** (2011/2015/2019/2023). Reihenfolge
  = Excel-Reihenfolge. Fehlt ein Wert in einer Ausgabe, bleibt die Spalte leer. Hauptspalten
  (`hwb`, `eeb`, `peb`, `co2`, `fgee`) führen den **Standortklima-Wert** (realer Bedarf / Inserat-Zahl);
  RK- und Ref-Varianten in eigenen Spalten (`hwb_rk`, `hwb_ref_sk`, `hwb_ref_rk`, `eeb_rk`, `fgee_rk`).
  `NUM_KEYS`/`KENNZAHLEN` beim Spalten-Ändern mitpflegen.
- `extract()` — ein Aufruf pro Feld. Extraktions-Bausteine:
  - `byLabel(lines, labelRe, opt)` — Label-Zelle → Wert aus derselben/Nachbarzelle. `{num, unit}` für
    Zahl vor Einheit; `{up}`/`{down}` für Wert in Zeile darüber/darunter (ArchiPHYSIK splittet Label/Wert).
    Zellen = durch 2+ Leerzeichen getrennte Stücke (`cells()`).
  - **Energie-Kennzahlen (RK/SK-bewusst):** ein vorberechnetes `sec[]`-Array markiert je Zeile den
    Klima-Block (`ANFORDERUNGEN/Referenzklima` → RK, `WÄRME- UND ENERGIEBEDARF/Standortklima` → SK).
    `byGerman(labelRe, {section, unit, …})` ankert an der deutschen Bezeichnung; `byAbbrAdjacent(abbrRe,
    {section})` nimmt den einheitsbehafteten Wert direkt neben der Abkürzung (rechts bei GEQ, links bei
    ArchiPHYSIK). `specOnLine()` liefert den ersten kWh/m²a-Wert einer Zeile (= realer Bedarf, nicht die
    Anforderungsgrenze rechts). `fgeeIn(section)` nimmt bei „0,900 0,817" (Limit+Ist) den letzten Wert.
  - direkter Regex über `reText(text, re)` für Datum, OIB-Ausgabe, Klassen; `dateNear()` für Datum in
    der Folgezeile. Ein eawz-Block (`if (/AUSWEISUNG IN INSERATEN|FÖRDERANSUCHEN/)`) überschreibt die
    unsicheren Vorarlberg-Stapelspalten mit den sauberen Inserat-Kennzahlen.
- `isEnergieausweis(text)` — Punkte-Schwelle (≥2); darunter wird die Datei übersprungen (in ENERGIE-
  Ordnern liegen auch fremde PDFs).
- `cleanNum()` — normalisiert österreichische Dezimalkommas (`45,6`→`45.6`) und Tausenderpunkte.
  `NUM_KEYS` = Spalten, die als echte Zahl ins Excel gehen.

**Ordner-Scan:** `walk()` ist rekursiv, liefert PDFs aber nur aus Teilbäumen, deren Ordnername
`ENERGIE` enthält (`ENERGIE_RE`, vererbt sich nach unten). Dateinamen egal.

## Neues Aussteller-Format ergänzen

Geprüft gegen GEQ, eawz, ILS ZT, e-s-e, FIBY ZT, klimafonds (Baujahre 2010–2024), zwei Layout-Familien:
klassische Tabellen (inkl. LEK) und OIB-2015+-Kennwertblöcke. Workflow:

1. PDF nach `test/samples/` legen, `node test/validate.js test/samples` laufen lassen.
2. Fehlt/falsch ein Feld → das passende `byLabel`/`metric`/Regex in `extract()` anpassen.
3. `python3 build.py` → erneut validieren → committen.

## CI / Deploy

`.github/workflows/deploy-pages.yml` baut bei jedem Push auf `master` (`python3 build.py`) und deployt
`dist/` nach GitHub Pages. **Kein Test-Gate:** Die CI ruft `validate.js` NICHT auf — vor dem Push lokal
`node test/validate.js test/samples` grün halten, sonst geht eine kaputte Engine live. `dist/index.html`
ist committet, wird aber im Deploy ohnehin frisch aus dem Template gebaut.

## Designprinzip

Bei unsicherem Layout bewusst **leer / `MANUELL`** statt falscher Zahl. Keine OCR — gescannte PDFs
(keine Textebene) werden nur als `MANUELL` markiert. Werte sind heuristisch und vor Verwendung zu sichten.
