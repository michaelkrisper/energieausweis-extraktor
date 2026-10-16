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
node test/fetch.js                           # Korpus-PDFs aus _quelle laden (nicht im Repo)
node test/validate.js test/samples 2>/dev/null         # Assert-Harness, Exit≠0 bei FAIL/MISS
node test/validate.js test/samples --baseline 2>/dev/null   # PASS-Stand als baseline.json sichern
node test/validate.js test/samples --jitter 2>/dev/null     # + metamorpher Jitter-Test (CI-Gate, ~1 min)
node test/dump.js test/samples/<datei>.pdf 2>/dev/null  # layouttreuen pdf.js-Text eines PDFs dumpen
```

Kein Lint/Unit-Framework. „Test" = `validate.js`. Pro PDF mit `<name>.expected.json` läuft der
**Assert-Modus** (PASS/FAIL/MISS gegen handgelesene Soll-Werte, Exit-Code, `Δ vs Baseline`); ohne
Fixture nur Coverage. Der Referenz-Korpus in `test/samples/` muss grün bleiben (100 %). Die PDFs
sind fremde Ausweise und liegen **nicht** im Repo (gitignored): committet wird je PDF nur die
Fixture mit `_quelle` (URL) und `_sha256`; `test/fetch.js` lädt fehlende PDFs und prüft die
Prüfsumme. Tote Quellen (Stand 2026-10-15: egw, iu, kappl, oesw, vatter) fehlen in der CI und
lassen sich nur lokal prüfen — `validate.js` listet sie als „Fixture ohne PDF". `2>/dev/null` blendet harmlose pdf.js-Font-Warnungen aus.

## Architektur

**Build-Modell (kritisch):** `dist/index.html` ist ein **generiertes Artefakt**, nicht editieren.
`build.py` inlinet die `vendor/`-Libs über Platzhalter-Kommentare (`<!--__PDFJS__-->` etc.) in
`src/app.template.html`. SheetJS (`xlsx.full.min.js`) kommt als klassisches `<script>`. pdf.js 6
(`pdf.min.mjs`) **und** der Worker (`pdf.worker.min.mjs`) sind **ES-Module** → werden als
`type="text/plain"`-Blöcke eingebettet; das Template baut daraus zur Laufzeit Blob-URLs und lädt pdf.js
per dynamischem `import()` (`pdfjsReady`-Promise, vor erstem `getDocument` awaiten), den Worker via
`GlobalWorkerOptions.workerSrc`. Quelle ist immer das Template; nach jeder Änderung `python3 build.py`.
Die Libs liegen committet in `vendor/`, damit der Build offline reproduzierbar ist.

**Zeilenbildung (`groupLines`, im Engine-Block, von Template, validate.js und dump.js gemeinsam
genutzt):** nach y absteigend; ein Item gehört zur laufenden Zeile, solange es höchstens
`LINE_TOL` = 1,25 unter deren oberstem Item liegt; deckungsgleich doppelt/dreifach gedruckte Items
(Fett-Simulation: AX3000 „ZAZA", macOS-Quartz-Neudruck) werden verworfen. Verschiebungsinvariant — das frühere feste Raster
`Math.round(y/2)*2` trennte Items 0,2 auseinander, wenn eine Rastergrenze dazwischen lag, und
gruppierte bei um 1 Einheit versetzter Seite anders (Jitter-Test: 89 von 189 Läufen abweichend).
1,25 liegt in einer dünnen Stelle der Grundlinienabstände des Korpus: Label/Wert-Versatz bis 1,13
(ArchiPHYSIK 1,00, ECOTECH 2011 1,02–1,13) wird eine Zeile, Sub-/Hochstellungen ab ~1,3 bleiben
eigene Zeilen. Wer `LINE_TOL` ändert, muss Korpus UND `--jitter` grün halten.

**Jitter-Test (`--jitter[=N]`):** liest jedes PDF zusätzlich N-mal (Default 3) mit deterministisch
verschobenen Items (Seitenversatz ±0,5–1 in x/y, Item-x-Rauschen ±0,3, Nachbartausche in der
Item-Reihenfolge; Hook `tweak` in `pdfToText`) und verlangt Feld für Feld dasselbe Ergebnis — sonst
Exit 1. Läuft in der CI. Per-Item-y-Rauschen (`JNY`) misst nur die Kante von `LINE_TOL` und ist aus.

**Eine Engine, zwei Aufrufer — kein Drift:** Die Extraktionslogik lebt nur in `src/app.template.html`.
`test/validate.js` dupliziert sie NICHT, sondern `eval()`t den Engine-Block direkt aus dem Template
(Slice `const NUM_KEYS` … `// ---- State`). Ändert man die Engine, ändern sich Browser **und** Test
gemeinsam. Die `pdfToText`-Zeilenrekonstruktion ist in beiden bewusst 1:1 identisch gehalten (die Zeilenbildung
selbst steckt in `groupLines` im Engine-Block).

**Pipeline:** PDF → `pdfToText` rekonstruiert layouttreuen Text aus den 2D-Textpositionen von pdf.js
(Items per `groupLines()` zu Zeilen gruppiert, nach x sortiert; Lücken > ~14 Einheiten → Doppel-Leerzeichen)
und liefert zusätzlich `linePos` — 1:1 zu den Textzeilen `{page, y, parts:[{x,y,w,s}]}` (Zeilen-y = oberstes Item) mit den ECHTEN
pdf.js-Positionen. → `extract(text, linePos)` füllt pro Feld einen Wert (ohne `linePos` fallen alle
Positions-Helfer auf reine Textlogik zurück). → editierbare HTML-Tabelle → SheetJS-Export (`.xlsx`,
Autofilter, echte Zahlen). Nur die ersten 14 Seiten werden gelesen.

**Engine-Kern (`src/app.template.html`):**
- `COLUMNS` — Spaltensatz = **Vereinigungsmenge aller OIB-Ausgaben** (2011/2015/2019/2023). Reihenfolge
  = Excel-Reihenfolge. Fehlt ein Wert in einer Ausgabe, bleibt die Spalte leer. Hauptspalten
  (`hwb`, `eeb`, `peb`, `co2`, `fgee`) führen den **Standortklima-Wert** (realer Bedarf / Inserat-Zahl);
  RK- und Ref-Varianten in eigenen Spalten (`hwb_rk`, `hwb_ref_sk`, `hwb_ref_rk`, `eeb_rk`, `peb_rk`,
  `peb_nern_rk`, `peb_ern_rk`, `co2_rk`, `fgee_rk`; `peb_rk`/`peb_(n)ern_rk`/`co2_rk` druckt der
  OIB-2015+-Anforderungsblock von ECOTECH/BuildDesk).
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
  (rechtsbündige Header) bleibt bewusst die Textlogik aktiv. Die Unterzeile darf auf zwei Textzeilen
  zerfallen und „spezifsch" (Tippfehler im sozialbau-Formular) heißen. Header nur, wenn die Zeile
  AUSSCHLIESSLICH aus Header-Tokens besteht (Prosa zählt nicht). `numAboveLabel()` holt x-ausgerichtete
  Werte aus der Zeile ÜBER dem Label (AX3000 stapelt `0,29  -16,0` über „mittlerer U-Wert … Norm-Außen…").
  `byLabel` hat einen Fließtext-Guard (kleingeschriebenes Wort vor dem Label = Satz, kein Feld).
- **Gebäudedaten (`byLabel` num + `nearLabel`):** Zahl mit Einheit schlägt Zahl ohne (zwei Durchgänge
  — sonst gewinnt das Inhaltsverzeichnis „… Brutto-Grundfläche und -volumen Projekt  18"); Wertzellen
  nur bis zur nächsten Label-Zelle (eawz 2024 „Kompaktheit A/V  Soll-Innentemperatur  22,0 °C" lieferte
  sonst 22,0); jedes Feld hat einen Plausibilitätsbereich (`opt.ok`, z. B. A/V 0,02–3, HGT 1000–9000,
  Seehöhe 100–4000) — außerhalb = Fehlgriff → nächster Treffer bzw. leer. Steht der Wert nicht neben
  dem Label, holt `nearLabel()` ihn aus derselben Tabellen-ZEILE: x im Feld des Labels (Labelanfang
  bis nächstes Label), Baseline ±5 vom Label (nutzt `y` aus `linePos`; der y-Bucket trennt Label und
  Wert oft um 1–2 Einheiten, Zeilenabstand der Formulare ≥ 10). Gleiches Prinzip für den Aussteller
  (Name knapp über/unter dem Label, mehrzeilig über x-bündige Folgezeilen ohne Ziffer) und für
  WB-Systeme, die AX3000 zweizeilig um die leere Labelzeile zentriert (`textAroundLabel`).
- **OIB-Formularraster (Partnerlabel):** Deckblattkopf (BEZEICHNUNG/Umsetzungsstand … Grundstücksnr./
  Seehöhe) und GEBÄUDEKENNDATEN (3 Spalten, 9 Zeilen) sind im OIB-Muster normiert. Fehlen einzelne
  Labels im Textlayer (AX3000 über „Microsoft: Print To PDF" rastert Teile, `roitham`), bestimmen die
  vorhandenen Labels Zeilenabstand und Spalten-x; Text in Zeile/Spalte eines fehlenden Labels gehört
  zu dessen Feld. Nur mit ≥ 3 rasterkonsistenten Labels, nur für leere Felder, nur in Zeilen mit
  eigenem Label (oder direkt darunter), nie in eine Zelle mit fremdem Label, nur plausible Werte.
  Völlig labellose Formulare (ArchiPHYSIK ≥ 18 IfEA/OÖ) erreicht das bewusst NICHT.
- **Positionslogik in Anforderungszeilen (`istRight`/`dropLimits`):** Alle Layout-Familien des Korpus
  drucken eine Anforderungszeile gleich: `Bezeichnung | [erfüllt] | Anforderung | Abkürzung | IST-Wert`
  (GEQ, ArchiPHYSIK, ECOTECH). Der Ist-Wert ist damit der Wert **rechts der Abkürzung**; links steht die
  Grenze. `istRight()` löst das über eine zeichengenaue x-Karte der Zeile (`xmap`, gleiche Rekonstruktion
  wie `pdfToText`, damit auch Treffer über mehrere pdf.js-Items wie „HWB " + „Ref,SK" verortbar sind) und
  bezieht die direkten Nachbarzeilen derselben Seite mit ein — mit Baseline-y nur, soweit sie zur selben
  TABELLENZEILE gehören (±6 um die Abkürzung; sonst lieferte ArchiPHYSIK 13 den Wert der Folgezeile) (die x-Karte repariert Mojibake
  zeichenweise mit, sonst wäre „kWh/m≤a" nie als Einheit lesbar) — der y-Bucket zerlegt eine Tabellenzeile oft
  in zwei Textzeilen (Wert oben, Abkürzung darunter). Die Zeile der Abkürzung gewinnt immer zuerst;
  Nachbarzeilen gehören sonst zur NÄCHSTEN Kennzahl (`ownRow`-Flag schaltet sie ganz ab). `dropLimits()`
  wirft Werte raus, über/unter denen das Subskript `…,zul` steht (GEQ: „f GEE,RK = 0,43 entspricht
  f GEE,RK,zul = 0,75"). Das ersetzt die ordinalen Weichen „erster Wert der Zeile" / „letzter Wert" /
  „rechts, sonst links" — die je nach Layout in die entgegengesetzte Richtung rieten und dort, wo die
  Zeilenrekonstruktion anders schneidet, den ANFORDERUNGSWERT lieferten (belegt an `iu_2019_wg`:
  `HWB Ref,RK` war 29,18 = `HWB_Ref,RK,zul` = 16·(1+3,0/l_c), Ist ist 24,29). Textlogik bleibt als
  Fallback, wenn keine Positionsdaten vorliegen.
- **Berechnete Klassen:** `hwb_klasse`/`fgee_klasse` stehen oft nur in der Deckblatt-GRAFIK; die
  Klassengrenzen sind normativ fix (OIB RL6, ident 2015/2019/2023) → Fallback berechnet sie aus
  `hwb_ref_sk`/`hwb` bzw. `fgee`. Gilt auch für „Sonstige konditionierte Gebäude" (nur HWB_Ref-Skala):
  `standrae_2023_sonstige` druckt bei HWB Ref,SK = 245,0 das `F` der WG/NWG-Skala — Beleg als
  Assertion `hwb_klasse` im Fixture.
- **Deckblatt-Kreuzcheck (`deckblattKlassen()`):** Die vier großen Deckblatt-ZAHLEN liegen meist in der
  Grafik, der Skalen-BUCHSTABE je Kennzahl steht aber oft im Textlayer — spaltenweise unter dem Kopf
  „HWB PEB CO2 fGEE", per x-Position zugeordnet, auch vertikal gestapelt auf der Höhe der Skalenstufe
  (ETU/GEQ; Fenster über die ganze Skala). 43 von 74 Korpus-PDFs lesbar, Rest bewusst leer statt
  geraten. Kopf „HWB* SK" (NWG OIB 2011) = Skala in kWh/m³a → kein Band-Kreuzcheck. Er ist die bessere Quelle für `hwb_klasse`/`fgee_klasse` als der
  Rechen-Fallback und dient als Gegenprobe: fällt der extrahierte Wert in ein anderes Band als der
  gedruckte Buchstabe (Toleranz ±0,5 % gegen Rundung an der Bandgrenze), setzt `extract()`
  `r.pruefen` und `runScan` daraus den Status `PRÜFEN · Deckblatt ≠ Tabelle`. Werte werden NIE
  überschrieben.
- **Plausibilitätsprüfung (Ende von `extract()`):** hängt Widersprüche an `r.pruefen` an
  (`PRÜFEN · Plausibilität: …`), überschreibt nie. Regeln: Wertebereiche je Kennzahl (Komma-/Lesefehler),
  BF = 0,8·BGF, A/V = A/V_B, lc = V_B/A (bzw. lc·A/V = 1), PEB = PEB n.ern. + PEB ern. (SK und RK),
  SK/RK-Verhältnis derselben Kennzahl (HWB/EEB 0,4–2,5, fGEE 0,6–1,6), gedruckte Inserat-Klasse ↔ Wert,
  Datum (Kalendertag, Gültigkeit nach Ausstellung, ≤ 10 Jahre), spez. Wert × BGF = Jahreswert, wenn auf
  der Fundzeile genau ein kWh/a- bzw. kg/a-Betrag steht. Stand: 0 Fehlalarme auf allen 81 Korpus-PDFs (einziges PRÜFEN: `voesendorfbadgasse`, Dokument selbst widersprüchlich, im `_layout` belegt);
  jede neue Regel muss das halten (Ausnahme: das PDF selbst ist widersprüchlich — dann im Fixture-`_layout`
  dokumentieren). Stichprobe auf 128 ungesehenen textbasierten Ausweisen der Reserve: 9 markiert, laut
  Sichtung Dokument-Widersprüche (A/V-Feld passt nicht zu A und V) oder echte Lesefehler in Altformaten.
- **ArchiPHYSIK-2019-Formular ohne Labels (`apLabellos()`):** ArchiPHYSIK 18–25 (IfEA, Pilz & Partner,
  RWT plus, Heinrich, Hollabrunn …) druckt ALLE Labels des OIB-2019-Formulars als Vektorgrafik; im
  Textlayer stehen nur Werte. Eigener Block vor `extract()`, ein Aufruf am Ende von `extract()`
  (überschreibt die generischen Treffer, die dort nur Datenblatt/Anhang erreichen). Erkennung: Seite
  mit ArchiPHYSIK-Fußzeile, ohne Formularlabels, mit x-gleich gestapeltem Datumspaar (Ausstellung/
  Gültigkeit). Zuordnung nur relativ: Spalten = rechtsbündige Wertkanten, Zeilen = Rasterfolge;
  Standortklima = 15 (WG) / 20 (NWG) Zeilen, Q-Spalte fehlt genau in eAWZ-/fGEE-Zeilen, Q/spez. =
  BGF, PEB = n.ern. + ern.; Kenndaten über 2 von 3 Formelankern (BF = 0,8·BGF, l_c·A/V = 1,
  A/V = A/V_B); Deckblatt = Nachbarseite mit Effizienzskala (Vösendorf heftet es HINTER Seite 2),
  Buchstaben nach x. Was die Anker nicht bestätigen, bleibt leer. `isEnergieausweis(text, linePos)`
  erkennt so auch reine Formularauszüge ohne ein einziges Stichwort. Belege: 10 Korpus-PDFs
  `*_2019_*_archiphysik` (5 davon Holdout, vor dem ersten Lauf von Hand geschrieben); alle 20
  labellosen ArchiPHYSIK-Ausweise der Reserve liegen innerhalb der ersten 8 Seiten — die
  14-Seiten-Grenze reicht.
- `extract()` — ein Aufruf pro Feld. Extraktions-Bausteine:
  - `byLabel(lines, labelRe, opt)` — Label-Zelle → Wert aus derselben/Nachbarzelle. `{num, unit}` für
    Zahl vor Einheit; `{up}`/`{down}` für Wert in Zeile darüber/darunter (ArchiPHYSIK splittet Label/Wert).
    Zellen = durch 2+ Leerzeichen getrennte Stücke (`cells()`).
  - **Energie-Kennzahlen (RK/SK-bewusst):** ein vorberechnetes `sec[]`-Array markiert je Zeile den
    Klima-Block (`ANFORDERUNGEN/Referenzklima` → RK, `WÄRME- UND ENERGIEBEDARF/Standortklima` → SK).
    `byGerman(labelRe, {section, unit, …})` ankert an der deutschen Bezeichnung; `byAbbrAdjacent(abbrRe,
    {section})` nimmt den einheitsbehafteten Wert direkt neben der Abkürzung (rechts bei GEQ, links bei
    ArchiPHYSIK). `specOnLine()` wählt bei mehreren Werten einer Zeile über `istOnLine()`: (1) `…,zul`-
    Subskript = Anforderung (`dropLimits`), (2) Kopfzeile „Ergebnisse | Anforderungen" bzw. „Berechnet |
    Grenzwert | Anforderung" → x-nächste Ist-Spalte (`istHeader`), (3) Flächenbezug: steht ein kWh/a-
    (kg/a-)Wert auf der Zeile, ist der Ist-Wert dessen Quotient durch die BGF (ETU 2011 ohne Spaltenkopf
    im Textlayer). Erst wenn nichts eindeutig ist (oder ohne `linePos`), greift die Textweiche „erster
    Wert mit Einheit" bzw. bei „≥" der letzte. `fgeeIn(section)` löst über `dropLimits`/`istRight`
    (auch gestapelt „f" / „GEE") auf; die Textweiche (bei „entspricht" erster, sonst letzter Wert)
    bleibt nur Fallback. Einzige verbliebene Ordinalentscheidung im Korpus trotz Positionsdaten:
    ETU-2011-fGEE-Zeile „=  0,71  0,74" (vatter) — kein Kopf, keine Abkürzung, keine Bezugsgröße.
    Werte der Label-Zeile schlagen die Folgezeile (GEQ 2023 stellt darunter „PVE =0,0").
    `byAbbrLine(abbrRe)` = einheitsstrikt und NUR auf der Abkürzungszeile selbst — für Vorarlberg-
    Stapellayouts, wo Nachbarzeilen zu anderen Kennzahlen gehören (kein Zeilenübergriff). Achtung:
    `sec[]` schaltet nur auf **Überschriftszeilen** um — Fließtext (Satzpunkt, „…", kleingeschriebene
    Funktions-/Verbwörter) und Klimaspalten-KÖPFE (Zeile nennt RK **und** SK, z.B. klimafonds
    „Referenzklima Standortklima Anforderung") lassen den Block stehen. Vor jedem `sec[]`-Zugriff
    steht `colValue`: liegen Positionsdaten vor, entscheidet die x-Position.
  - direkter Regex über `reText(text, re)` für Datum, OIB-Ausgabe, Klassen; `dateNear()` für Datum in
    der Folgezeile. Ein eawz-Block (`if (/AUSWEISUNG IN INSERATEN|FÖRDERANSUCHEN/)`) überschreibt die
    unsicheren Vorarlberg-Stapelspalten mit den sauberen Inserat-Kennzahlen.
- **OIB-RL6 Ausgabe September 2025** (gilt in Wien ab 15.07.2026, Tirol ab 16.07.2026; noch keine
  echten öffentlichen Ausweise, geprüft nur am RIS-Muster `LGBLA_TI_20260715_59` Anlage 6 inkl. mit
  Ziffern befüllter Platzhalter): erkannt an „Ausgabe: September 2025" bzw. am Zitat „Richtlinie (EU)
  2024/1275" (`OIB2025`). Dort gibt es keinen fGEE (`fgee`/`fgee_rk`/`fgee_klasse` bleiben leer), die
  Skala ist A–G mit neuen Grenzen (HWB Ref,SK A ≤ 40 … G > 120, EEB-Klasse mit Zusatz „fossil"; Klasse A
  nur dekarbonisiert) → KEIN Rechen-Fallback und kein Band-Kreuzcheck, nur gedruckte Buchstaben
  (`hwb_klasse` folgt dann der neuen Skala — `ausgabe` sagt welche). Das OIB-Formularraster ist für 2025
  aus (anderes Kenndaten-Raster). Labelvarianten: „Ersteller" (nur 2025, IfEA-Deckblätter nutzen
  „Ersteller:" als Adresskopf), „Bemessungstemperatur (Heizfall)" → `soll_innen`, „Art der
  Lüftungsanlage", Grenzwert-Subskripte „EEBzul,RK"/„HWBRef,Bem,RK"/„…,max,RK", Einheit „kWh/m2a"
  (wird längentreu zu „kWh/m²a"). Neue 2025-Kennzahlen (EEB-Klasse, Anteil am Standort erzeugter
  erneuerbarer Energie, GWP LC) haben noch KEINE Spalten — erst mit echten Ausweisen nachziehen.
- `isEnergieausweis(text)` — Punkte-Schwelle (≥2); darunter wird die Datei übersprungen (in ENERGIE-
  Ordnern liegen auch fremde PDFs).
- **Text-Normalisierung vor der Extraktion (alle längentreu, Text UND Positionsdaten):** U+0000 statt
  Leerzeichen (Foxit), „kWh/m2a" → „kWh/m²a" (OIB-2025-Muster), Unicode-Minus, und **englisches
  Zahlenformat** (Druck unter englischem Gebietsschema: „1,554.0m³", „315.3kWh/m²a"): überwiegen
  Dezimalpunkte mit 1–2 Nachkommastellen vor Einheiten die Dezimalkommas deutlich (≥ 8 und > 4×), werden
  „." und „," in Zahlen getauscht (Datumsangaben/Versionsnummern bleiben). Datum zusätzlich
  `TT-MM-JJJJ` und ISO.
- **Mojibake-Reparatur:** PDFs aus einem Ghostscript-Druckpfad (PDF24 Creator; Beleg `proholz_2019_nwg`:
  ECOTECH 3.3.1679, Producer „GPL Ghostscript 10.02.1") liefern Latin-1-Bytes MacRoman-dekodiert
  (`ƒ`=Ä, `‰`=ä, `≤`=², `∞`=°) — kein Mac-/ArchiPHYSIK-Merkmal, die ArchiPHYSIK-PDFs des Korpus sind
  sauber. `extract()` erkennt das (≥3ד‰/¸/ˆ vor Kleinbuchstabe") und mappt per fester Tabelle zurück; ß→fl-Ligatur wird von pdf.js zu ASCII „fl" normalisiert und ist nur
  wortweise reparierbar (`Strafle`→`Straße`, `Auflen`→`Außen`).
- `cleanNum()` — normalisiert österreichische Dezimalkommas (`45,6`→`45.6`) und Tausenderpunkte.
  `NUM_KEYS` = Spalten, die als echte Zahl ins Excel gehen.

**Ordner-Scan:** `walk()` ist rekursiv, liefert PDFs aber nur aus Teilbäumen, deren Ordnername
`ENERGIE` enthält (`ENERGIE_RE`, vererbt sich nach unten). Dateinamen egal.

## Neues Aussteller-Format ergänzen

Geprüft (81 PDFs, Stand 2026-10-16) gegen GEQ (2011–2023, Kärnten/Salzburg/OÖ/Tirol/NÖ, ZEUS-Stempel aller
Länder, ZEUS-Kärnten-2011-NWG-Spaltentabellen), eawz (Vorarlberg 2015 und Formular 2024 nach BEV 68/2021
inkl. OIB-Seite 2 im Stapellayout), ILS ZT, e-s-e, FIBY ZT, klimafonds, ETU Gebäudeprofi Duo 6.2–7.4
(Tirol, OÖ, NÖ, Salzburger Prüfbericht), ArchiPHYSIK (Version 16/17/25 — 25 stellt die Deckblattwerte
ÜBER die Labelzeile, `numAboveLabel`; 18–25 mit OIB 2019 ohne Labels, `apLabellos`; auch macOS-Quartz-Neudruck und englisches Gebietsschema), MA 39 Wien,
ECOTECH/BuildDesk (2011/2015/2019/2023, OÖ-Variante mit „X =" über der Wertzeile, Ghostscript-Mojibake),
AX3000/Allplan (H-5055-Layout von 2010 und OIB-2019-Formular inkl. teilgerastertem „Microsoft: Print To
PDF"-Druck → OIB-Formularraster) — Baujahre 1900–2025, drei Layout-Familien: klassische Tabellen (inkl. LEK), Klimaspalten-
Tabellen mit Unterzeile (positionsbasiert) und OIB-2015+-Kennwertblöcke. OIB 2023 kennt neben WG/NWG die dritte Kategorie
„Sonstige konditionierte Gebäude" — solche Ausweise führen NUR HWB_Ref (SK/RK) + KB*; EEB/PEB/fGEE
bleiben dort bewusst leer. Workflow:

1. PDF nach `test/samples/` legen, Fixture mit `_quelle` (direkte URL) + `_sha256` (`sha256sum`)
   anlegen (Werte NUR aus dem Dump, nie aus dem Extraktor-Output; Konventionen unten),
   `node test/validate.js test/samples` laufen lassen.
2. Fehlt/falsch ein Feld → das passende `byLabel`/`metric`/Regex in `extract()` anpassen.
3. `python3 build.py` → erneut validieren (auch `--jitter`) → committen.

**Holdout statt Selbstbestätigung:** Neue Engine-Regeln entstehen am Korpus — ob sie generalisieren,
zeigt nur ein ungesehener Satz. Vorgehen (2026-10-16 erstmals): NACH den Engine-Änderungen 6–10 neue
Ausweise unterschiedlicher Software/Bundesländer wählen, Fixtures von Hand aus dem Dump schreiben (OHNE
vorher den Extraktor darauf laufen zu lassen), Quote messen und berichten, erst DANN Lücken beheben und
die Fixtures in den Korpus übernehmen. Ergebnis 2026-10-16: 614/623 = 98,6 % (Engine vor der Branch-Arbeit:
94,9 %); die Lücken (Doppelglyphen, zweizeilige WB-Systeme, Stapellayout der eawz-OIB-Seite, CO2 aus
fGEE-Folgezeile) sind behoben.

**Fixture-Konventionen (Soll-Werte):**
- `kategorie` = normierte OIB-Gebäudekategorie, genau drei Werte: `Wohngebäude`, `Nichtwohngebäude`,
  `Sonstige konditionierte Gebäude` — aus dem Formulartitel „Energieausweis für …" (auch bei Umbruch
  über zwei Zeilen). Nur asserten, wenn der Titel im Textlayer steht. Die Engine leitet sie sonst aus
  einem eindeutigen OIB-Nutzungsprofil ab (AX3000 druckt den Titel nur als Grafik).
- `nutzungsprofil` = Detailangabe wie gedruckt (Bürogebäude, Einfamilienhaus, „Wohngebäude mit drei bis
  neun Nutzungseinheiten", Plural „Mehrfamilienhäuser" …), mehrzeilige Werte vollständig.
- `aussteller` = vollständiger Inhalt des ErstellerIn-Felds ohne Anschrift: mehrzeilige Namen ganz
  (ECOTECH druckt Organisation + Person untereinander: „plansprechend" / „DI Hannes Wachernig";
  GEQ bricht „… GmbH & Co" / „KG" um).
- Datumsfelder als `TT.MM.JJJJ`; Monatsnamen („30.September 2025", AX3000) werden numerisch erwartet.
- Feld leer gedruckt („---", „-", „k.A.") → `""` asserten; Key weglassen = nicht geprüft.

## CI / Deploy

`.github/workflows/deploy-pages.yml` läuft bei jedem Push auf `main`: erst das **Test-Gate**
(`npm install` + `node test/fetch.js` + `node test/validate.js test/samples --jitter` — Exit ≠ 0 bei FAIL, MISS **oder** Jitter-Abweichung blockiert
das Deploy; `npm ci` geht nicht, weil `package-lock.json` bewusst nicht committet ist), dann Build
(`python3 build.py`) und Deploy von `dist/` nach GitHub Pages. Trotzdem vor dem Push lokal grün
halten — ein roter main deployt nicht, bleibt aber rot liegen. `dist/index.html` ist committet,
wird aber im Deploy ohnehin frisch aus dem Template gebaut.

## Designprinzip

Bei unsicherem Layout bewusst **leer / `MANUELL`** statt falscher Zahl. Keine OCR — gescannte PDFs
(keine Textebene) werden nur als `MANUELL` markiert. Werte sind heuristisch und vor Verwendung zu sichten.
