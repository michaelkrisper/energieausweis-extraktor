# Testen & Tunen

Die ausgelieferte `dist/index.html` läuft im Browser über **pdf.js**. Damit Tuning dem echten
Browser-Verhalten entspricht, prüft das Harness `test/validate.js` mit **demselben pdf.js** und
**derselben `extract()`-Logik** wie das Template (es liest die Engine direkt aus
`src/app.template.html`, kein dupliziertes Regelwerk → kein Drift).

## Einmal einrichten (nur Entwickler-Rechner, nicht der Firmen-PC)

```bash
npm install            # holt pdfjs-dist (nur Dev-Abhängigkeit)
```

## Echte Ausweise prüfen

```bash
node test/validate.js test/samples            # mitgelieferter Referenz-Korpus (committet)
node test/validate.js /pfad/zu/eigenen/pdfs   # beliebiger Ordner
```

Zwei Modi, automatisch je PDF gewählt:

- **Assert-Modus** (wenn `<pdf>.expected.json` existiert): vergleicht jedes extrahierte Feld gegen
  den handgelesenen Soll-Wert. Ausgabe je PDF `✓/✗  n/m PASS` plus abweichende Felder als
  `FAIL` (falscher Wert) / `MISS` (Soll vorhanden, nichts erkannt), am Ende eine Gesamt-Quote.
  **Exit-Code ≠ 0**, sobald ein FAIL auftritt → echtes Pass/Fail fürs Tunen.
- **Coverage-Modus** (ohne Fixture): nur Feld-Abdeckung + wichtigste Werte (HWB, fGEE, Ausgabe,
  PLZ/Ort). Zeigt bei einem neuen Aussteller-Format sofort, was schon gelesen wird.

Regressions messen:

```bash
node test/validate.js test/samples --baseline   # aktuellen Stand als test/baseline.json sichern
node test/validate.js test/samples              # nächster Lauf zeigt "Δ vs Baseline" je PDF
```

Einzelnes PDF debuggen (layouttreuer pdf.js-Text, 1:1 wie die Engine ihn sieht):

```bash
node test/dump.js test/samples/<datei>.pdf 2>/dev/null
```

### Soll-Fixture anlegen
PDF von Hand lesen, echte Werte als `<pdf>.expected.json` daneben legen (Format: siehe vorhandene
Fixtures in `test/samples/`). Nur Felder eintragen, die im PDF **tatsächlich** stehen — fehlt ein Wert,
Key weglassen (dann gilt: Tool soll dort leer liefern). Zahlen normalisiert (Punkt statt Komma).
`_`-Keys sind Metadaten und werden nicht geprüft.

> pdf.js gibt auf der Konsole harmlose Font-Warnungen aus (`fetchStandardFontData …`,
> `Cannot polyfill DOMMatrix`). Mit `2>/dev/null` ausblenden.

## Geprüfter Stand

Reproduzierbarer Referenz-Korpus in `test/samples/` (echte PDFs + handgelesene `*.expected.json`),
**alle Felder grün** (`node test/validate.js test/samples` → 100 %, Exit 0). Abgedeckt:

| PDF | Ausgabe | Aussteller-SW | Typ |
|-----|---------|---------------|-----|
| vatter_2011_wg        | Okt 2011  | ETU Gebäudeprofi | WG (klassische Tabelle, LEK) |
| sozialbau_wg          | 2023      | — (kompakt)      | WG |
| hagger_muster_wg      | März 2015 | GEQ              | WG (EFH) |
| eawz_2015plus_wg      | März 2015 | eawz Vorarlberg  | WG (eigene Layout-Familie) |
| iu_2019_wg            | März 2015 | ArchiPHYSIK 13   | WG |
| hafner_2019_efh       | März 2015 | GEQ              | WG (EFH, Planung) |
| fiby_2015_nwg_hallenbad / _schule | März 2015 | GEQ (FIBY/AEE) | **Nicht-WG** |
| krems_2015_nwg        | März 2015 | ECOTECH 3.3      | **Nicht-WG** (Büro) |
| michaelauer_2024_efh  | April 2019| GEQ              | WG (EFH) |
| kappl_2019_nwg        | April 2019| ETU Gebäudeprofi | **Nicht-WG** (Büro, Kühlfelder) |
| sallingberg_2019_nwg  | April 2019| ECOTECH 3.3      | **Nicht-WG** (Extrembestand: HWB 615, fGEE 7,1) |
| arwag_ifea_wg         | Mai 2023  | ArchiPHYSIK 25   | WG |

Damit vier OIB-Ausgaben (2011/2015/2019/2023) und mehrere Layout-Familien:
klassische Tabellen, GEQ-/ArchiPHYSIK-/ETU-/ECOTECH-Kennwertblöcke (getrennte RK/SK/Ref-Spalten),
eawz-Vorarlberg — Wohn- und Nicht-Wohngebäude inkl. Kühl-/Betriebsstrom-Felder und Extremwerte
(fGEE > 4). Gescannte PDFs ohne Textebene (z. B. ältere GEQ-2009-Muster) sind kein Testfall (keine OCR).

Bewusste Grenzen: gescannte PDFs → `MANUELL` (keine OCR). RK/SK/Ref-Spalten nur, wenn der Ausweis
sie ausweist. Bei exotischen Layouts lieber leer/`MANUELL` als falscher Wert → in der editierbaren
Tabelle prüfen.

## Neues Format ergänzen

1. PDF nach `test/samples/` legen, `node test/dump.js <pdf>` ansehen, `node test/validate.js …` laufen.
2. `<pdf>.expected.json` mit den echten Werten anlegen.
3. Fehlt/falsch ein Feld → in `src/app.template.html` in `extract()` das passende `byLabel`/`byGerman`/
   `byAbbrAdjacent`/`metric`/Regex anpassen (siehe README → „Erkennung anpassen").
4. `python3 build.py` → `node test/validate.js test/samples` muss grün bleiben → committen.
