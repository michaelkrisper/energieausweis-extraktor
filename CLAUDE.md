# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

Lokales Single-File-Browser-Tool: liest österreichische Energieausweis-PDFs rekursiv aus einem
Ordnerbaum, extrahiert OIB-Kennwerte heuristisch und exportiert sie vereinheitlicht nach Excel.
Komplett offline, kein Server, keine Daten verlassen den Rechner. Voller Umfang in Chromium
(Edge/Chrome: Ordner-Picker + Drag&Drop via File System Access API); Firefox/Safari nutzen den
`<input webkitdirectory>`-Fallback. Alle Scan-Quellen (Picker/Drop/Fallback) liefern einheitliche
`{name, path, getFile()}`-Listen an eine gemeinsame `runScan()`-Pipeline.

## Befehle

```bash
python3 build.py                             # src/app.template.html + vendor/*.js -> dist/index.html
npm install                                  # pdfjs-dist (nur Dev-Harness, NICHT ausgeliefert)
node test/validate.js test/samples 2>/dev/null         # Assert-Harness, Exit≠0 bei FAIL/MISS
node test/validate.js test/samples --baseline 2>/dev/null   # PASS-Stand als baseline.json sichern
node test/dump.js test/samples/<datei>.pdf 2>/dev/null  # layouttreuen pdf.js-Text eines PDFs dumpen
```

Kein Lint/Unit-Framework. „Test" = `validate.js`. Pro PDF mit `<name>.expected.json` läuft der
**Assert-Modus** (PASS/FAIL/MISS gegen handgelesene Soll-Werte, Exit-Code, `Δ vs Baseline`); ohne
Fixture nur Coverage. Der Referenz-Korpus in `test/samples/` (PDFs + Fixtures) ist **committet** und
muss grün bleiben (100 %). `2>/dev/null` blendet harmlose pdf.js-Font-Warnungen aus.

## Architektur

**Build-Modell (kritisch):** `dist/index.html` ist ein **generiertes Artefakt**, nicht editieren.
`build.py` inlinet die `vendor/`-Libs über Platzhalter-Kommentare (`<!--__PDFJS__-->` etc.) in
`src/app.template.html`. SheetJS (`xlsx.full.min.js`) kommt als klassisches `<script>`. pdf.js 6
(`pdf.min.mjs`) **und** der Worker (`pdf.worker.min.mjs`) sind **ES-Module** → werden als
`type="text/plain"`-Blöcke eingebettet; das Template baut daraus zur Laufzeit Blob-URLs und lädt pdf.js
per dynamischem `import()` (`pdfjsReady`-Promise, vor erstem `getDocument` awaiten), den Worker via
`GlobalWorkerOptions.workerSrc`. Quelle ist immer das Template; nach jeder Änderung `python3 build.py`.
Die Libs liegen committet in `vendor/`, damit der Build offline reproduzierbar ist.

**Eine Engine, zwei Aufrufer — kein Drift:** Die Extraktionslogik lebt nur in `src/app.template.html`.
`test/validate.js` dupliziert sie NICHT, sondern `eval()`t den Engine-Block direkt aus dem Template
(Slice `const NUM_KEYS` … `// ---- State`). Ändert man die Engine, ändern sich Browser **und** Test
gemeinsam. Die `pdfToText`-Zeilenrekonstruktion ist in beiden bewusst 1:1 identisch gehalten.

**Pipeline:** PDF → `pdfToText` rekonstruiert layouttreuen Text aus den 2D-Textpositionen von pdf.js
(Items nach y-Position zu Zeilen gruppiert, nach x sortiert; Lücken > ~14 Einheiten → Doppel-Leerzeichen)
und liefert zusätzlich `linePos` — 1:1 zu den Textzeilen `{page, parts:[{x,w,s}]}` mit den ECHTEN
pdf.js-Positionen. → `extract(text, linePos)` füllt pro Feld einen Wert (ohne `linePos` fallen alle
Positions-Helfer auf reine Textlogik zurück). → editierbare HTML-Tabelle → SheetJS-Export (`.xlsx`,
Autofilter, echte Zahlen). Nur die ersten 14 Seiten werden gelesen.

**Engine-Kern (`src/app.template.html`):**
- `COLUMNS` — Spaltensatz = **Vereinigungsmenge aller OIB-Ausgaben** (2011/2015/2019/2023). Reihenfolge
  = Excel-Reihenfolge. Fehlt ein Wert in einer Ausgabe, bleibt die Spalte leer. Hauptspalten
  (`hwb`, `eeb`, `peb`, `co2`, `fgee`) führen den **Standortklima-Wert** (realer Bedarf / Inserat-Zahl);
  RK- und Ref-Varianten in eigenen Spalten (`hwb_rk`, `hwb_ref_sk`, `hwb_ref_rk`, `eeb_rk`, `fgee_rk`).
  Dazu die vollen OIB-2015+-Kennwertblöcke (`kb`, `kb_stern_rk` [kWh/m³a!], `keb`, `hhsb`, `bsb`,
  `befeb`, `beleb`, `peb_nern`, `peb_ern`, `peb_heb_nern_rk` [OIB 2023: PEB n.ern. für RH+WW(+Bel), RK],
  `pve`, `eawz_ww/rh/h/k`) und Gebäudedaten des Deckblatts (`huellflaeche`, `soll_innen`, `bauweise`,
  `ww_system`/`rh_system`/`kuehlsystem`, `solarthermie`, `photovoltaik`, `stromspeicher`, `heizlast`,
  `ern_anteil`, `kg_nr`, `ea_art` [Umsetzungsstand/EA-Art/ZEUS-Typ], `letzte_veraenderung`,
  `gwr`/`zeus`/`gz`). Spaltenlabels folgen der Norm-Nomenklatur der OIB-Muster (HWB Ref,SK / CO2eq,SK /
  eAWZ,WW …). `NUM_KEYS`/`KENNZAHLEN` beim Spalten-Ändern mitpflegen.
- **Positionslogik (`climHeaders`/`colValue`):** Tabellen mit Klimaspalten-Überschrift
  („Referenzklima  Standortklima  Anforderung") UND Unterzeile („spezifisch  zonenbezogen  spezifisch",
  ECOTECH/ETU/GEQ-2011/AX3000) werden über die echten x-Positionen aufgelöst: jeder Wert gehört zur
  x-nächsten Unterspalte; ein kWh/a-Wert wirkt als Paar-Anker (der spez. Wert direkt rechts erbt dessen
  Spalte — AX3000 druckt „zonal spez" je Klima). Achtung: die ERSTE spezifisch-Spalte ist dort das
  REFERENZKLIMA — der alte „erster kWh/m²a-Wert der Zeile"-Ansatz wäre falsch. Ohne Unterzeile
  (rechtsbündige Header, z.B. sozialbau) bleibt bewusst die Textlogik aktiv. Header nur, wenn die Zeile
  AUSSCHLIESSLICH aus Header-Tokens besteht (Prosa zählt nicht). `numAboveLabel()` holt x-ausgerichtete
  Werte aus der Zeile ÜBER dem Label (AX3000 stapelt `0,29  -16,0` über „mittlerer U-Wert … Norm-Außen…").
  `byLabel` hat einen Fließtext-Guard (kleingeschriebenes Wort vor dem Label = Satz, kein Feld).
- **Berechnete Klassen:** `hwb_klasse`/`fgee_klasse` stehen oft nur in der Deckblatt-GRAFIK; die
  Klassengrenzen sind normativ fix (OIB RL6, ident 2015/2019/2023) → Fallback berechnet sie aus
  `hwb_ref_sk`/`hwb` bzw. `fgee`. Gilt auch für „Sonstige konditionierte Gebäude" (nur HWB_Ref-Skala):
  `standrae_2023_sonstige` druckt bei HWB Ref,SK = 245,0 das `F` der WG/NWG-Skala — Beleg als
  Assertion `hwb_klasse` im Fixture.
- **Deckblatt-Kreuzcheck (`deckblattKlassen()`):** Die vier großen Deckblatt-ZAHLEN liegen in der
  Grafik (30 von 31 Korpus-PDFs), der Skalen-BUCHSTABE je Kennzahl steht aber im Textlayer —
  spaltenweise unter dem Kopf „HWB PEB CO2 fGEE", per x-Position zugeordnet (15 von 31 PDFs lesbar,
  Rest bewusst leer statt geraten). Er ist die bessere Quelle für `hwb_klasse`/`fgee_klasse` als der
  Rechen-Fallback und dient als Gegenprobe: fällt der extrahierte Wert in ein anderes Band als der
  gedruckte Buchstabe (Toleranz ±0,5 % gegen Rundung an der Bandgrenze), setzt `extract()`
  `r.pruefen` und `runScan` daraus den Status `PRÜFEN · Deckblatt ≠ Tabelle`. Werte werden NIE
  überschrieben.
- `extract()` — ein Aufruf pro Feld. Extraktions-Bausteine:
  - `byLabel(lines, labelRe, opt)` — Label-Zelle → Wert aus derselben/Nachbarzelle. `{num, unit}` für
    Zahl vor Einheit; `{up}`/`{down}` für Wert in Zeile darüber/darunter (ArchiPHYSIK splittet Label/Wert).
    Zellen = durch 2+ Leerzeichen getrennte Stücke (`cells()`).
  - **Energie-Kennzahlen (RK/SK-bewusst):** ein vorberechnetes `sec[]`-Array markiert je Zeile den
    Klima-Block (`ANFORDERUNGEN/Referenzklima` → RK, `WÄRME- UND ENERGIEBEDARF/Standortklima` → SK).
    `byGerman(labelRe, {section, unit, …})` ankert an der deutschen Bezeichnung; `byAbbrAdjacent(abbrRe,
    {section})` nimmt den einheitsbehafteten Wert direkt neben der Abkürzung (rechts bei GEQ, links bei
    ArchiPHYSIK). `specOnLine()` liefert den ersten kWh/m²a-Wert einer Zeile (= realer Bedarf, nicht die
    Anforderungsgrenze rechts). `fgeeIn(section)` nimmt bei „0,900 0,817" (Limit+Ist) den letzten Wert,
    bei „0,43 entspricht 0,75" (Ist+Limit, ETU/ArchiPHYSIK) den ersten; Werte der Label-Zeile schlagen
    die Folgezeile (GEQ 2023 stellt darunter „PVE =0,0").
    `byAbbrLine(abbrRe)` = einheitsstrikt und NUR auf der Abkürzungszeile selbst — für Vorarlberg-
    Stapellayouts, wo Nachbarzeilen zu anderen Kennzahlen gehören (kein Zeilenübergriff). Achtung:
    `sec[]` schaltet nur auf **Überschriftszeilen** um — Fließtext (Satzpunkt, „…", kleingeschriebene
    Funktions-/Verbwörter) und Klimaspalten-KÖPFE (Zeile nennt RK **und** SK, z.B. klimafonds
    „Referenzklima Standortklima Anforderung") lassen den Block stehen. Vor jedem `sec[]`-Zugriff
    steht `colValue`: liegen Positionsdaten vor, entscheidet die x-Position.
  - direkter Regex über `reText(text, re)` für Datum, OIB-Ausgabe, Klassen; `dateNear()` für Datum in
    der Folgezeile. Ein eawz-Block (`if (/AUSWEISUNG IN INSERATEN|FÖRDERANSUCHEN/)`) überschreibt die
    unsicheren Vorarlberg-Stapelspalten mit den sauberen Inserat-Kennzahlen.
- `isEnergieausweis(text)` — Punkte-Schwelle (≥2); darunter wird die Datei übersprungen (in ENERGIE-
  Ordnern liegen auch fremde PDFs).
- **Mojibake-Reparatur:** Mac-erzeugte PDFs (ArchiPHYSIK) liefern z.T. Latin-1-Bytes MacRoman-dekodiert
  (`ƒ`=Ä, `‰`=ä, `≤`=², `∞`=°). `extract()` erkennt das (≥3ד‰/¸/ˆ vor Kleinbuchstabe") und mappt
  per fester Tabelle zurück; ß→fl-Ligatur wird von pdf.js zu ASCII „fl" normalisiert und ist nur
  wortweise reparierbar (`Strafle`→`Straße`, `Auflen`→`Außen`).
- `cleanNum()` — normalisiert österreichische Dezimalkommas (`45,6`→`45.6`) und Tausenderpunkte.
  `NUM_KEYS` = Spalten, die als echte Zahl ins Excel gehen.

**Ordner-Scan:** `walk()` ist rekursiv, liefert PDFs aber nur aus Teilbäumen, deren Ordnername
`ENERGIE` enthält (`ENERGIE_RE`, vererbt sich nach unten). Dateinamen egal.

## Neues Aussteller-Format ergänzen

Geprüft gegen GEQ (inkl. Ausgabe Mai 2023 und ZEUS-Kärnten-2011-NWG-Spaltentabellen), eawz, ILS ZT,
e-s-e, FIBY ZT, klimafonds, ETU/ZEUS Tirol (inkl. Gebäudeprofi Duo 7.2), ArchiPHYSIK (auch Mac-Mojibake,
Version 16), MA 39 Wien, ECOTECH/BuildDesk (2011/2015/2019), AX3000/Allplan (H-5055-Layout, gestapelte
Werte) — Baujahre 2010–2025, drei Layout-Familien: klassische Tabellen (inkl. LEK), Klimaspalten-
Tabellen mit Unterzeile (positionsbasiert) und OIB-2015+-Kennwertblöcke. OIB 2023 kennt neben WG/NWG die dritte Kategorie
„Sonstige konditionierte Gebäude" — solche Ausweise führen NUR HWB_Ref (SK/RK) + KB*; EEB/PEB/fGEE
bleiben dort bewusst leer. Workflow:

1. PDF nach `test/samples/` legen, `node test/validate.js test/samples` laufen lassen.
2. Fehlt/falsch ein Feld → das passende `byLabel`/`metric`/Regex in `extract()` anpassen.
3. `python3 build.py` → erneut validieren → committen.

## CI / Deploy

`.github/workflows/deploy-pages.yml` läuft bei jedem Push auf `main`: erst das **Test-Gate**
(`npm install` + `node test/validate.js test/samples` — Exit ≠ 0 bei FAIL **oder** MISS blockiert
das Deploy; `npm ci` geht nicht, weil `package-lock.json` bewusst nicht committet ist), dann Build
(`python3 build.py`) und Deploy von `dist/` nach GitHub Pages. Trotzdem vor dem Push lokal grün
halten — ein roter main deployt nicht, bleibt aber rot liegen. `dist/index.html` ist committet,
wird aber im Deploy ohnehin frisch aus dem Template gebaut.

## Designprinzip

Bei unsicherem Layout bewusst **leer / `MANUELL`** statt falscher Zahl. Keine OCR — gescannte PDFs
(keine Textebene) werden nur als `MANUELL` markiert. Werte sind heuristisch und vor Verwendung zu sichten.
