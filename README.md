# GBG · Energieausweis-Extraktor

Liest österreichische **Energieausweis-PDFs** (Fokus **Steiermark / Graz & Umgebung**, GBG- bzw.
Stadt-Graz-Gebäude) rekursiv aus einem Ordnerbaum, extrahiert möglichst **viele** OIB-Kennwerte und
exportiert alles vereinheitlicht nach **Excel** — komplett **lokal im Browser**, kein Server, keine
Installation, keine Daten verlassen den Rechner.

## Benutzung (für Anwender)

1. `dist/index.html` auf den Rechner kopieren und in **Microsoft Edge** (oder Chrome) öffnen
   — Doppelklick genügt.
2. **„📁 Ordner wählen"** → den Wurzelordner wählen. Es werden **nur Ordner durchsucht, die
   `ENERGIE` im Namen tragen** (Teilbaum inklusive; Dateinamen sind egal).
3. PDFs, die **offensichtlich kein Energieausweis** sind, werden automatisch **übersprungen**
   (in den ENERGIE-Ordnern liegen oft auch andere PDFs).
4. Tabelle prüfen. **Jede Zelle ist editierbar** — Erkennungsfehler direkt korrigieren.
5. **„⬇ Excel exportieren"** → fertige `.xlsx` (mit Autofilter; Zahlen sind echte Zahlen).

### Status-Spalte
- `OK · n Kennzahlen` — automatisch erkannt, n Energie-Kennzahlen gefunden.
- `MANUELL · kein Text (Scan?)` — PDF hat keine Textebene (eingescannt) → von Hand erfassen.
- `MANUELL · Kennzahlen nicht gefunden` — Format weicht zu stark ab → von Hand prüfen.
- **übersprungen** (nur als Zähler) — Datei ist kein Energieausweis, kommt nicht in die Tabelle.

> **Browser:** Nur Chromium-basiert (Edge/Chrome). Firefox kann keine Ordner einlesen.

## Extrahierte Felder (Vereinigungsmenge aller OIB-Ausgaben)

Da sich die Ausgaben (2007/2011/2015/2019 …) unterscheiden, ist der Spaltensatz die **Vereinigung
aller Versionen**. Fehlt ein Wert in einer Ausgabe, bleibt seine Spalte leer.

**Stammdaten:** EA-Nr · OIB-Ausgabe · Adresse/Objekt · PLZ/Ort · Katastralgemeinde · Grundstücksnr ·
Einlagezahl · Gebäudekategorie · Nutzungsprofil · Baujahr · Lüftung.

**Geometrie/Standort:** Brutto-Grundfläche · kond./Bezugsfläche · Brutto-Volumen · charakt. Länge lc ·
Kompaktheit A/V · mittl. U-Wert · Klimaregion · Seehöhe · Heizgradtage · Norm-Außentemperatur · Heiztage.

**Energie-Kennzahlen** (spezifisch kWh/m²a; RK = Referenz-, SK = Standortklima):
HWB · HWB SK · HWB-Klasse · WWWB · HEB · HTEB · EEB · EEB SK · PEB · PEB SK · fGEE · fGEE-Klasse ·
CO₂ · CO₂ SK · **LEK-Wert** (ältere Ausweise).

**Abschluss:** Ausstelldatum · Gültig bis · Aussteller · Pfad.

## Robustheit / getestet

Gegen echte Muster mehrerer Aussteller-Programme und Ausgaben geprüft (GEQ, eawz, ILS ZT (Gleisdorf/Stmk),
e-s-e, FIBY ZT, klimafonds), Baujahre der Dokumente 2010–2024. Zwei Layout-Familien werden abgedeckt:
klassische Tabellen (GEQ/e-s-e, inkl. LEK) und moderne OIB-2015+-Kennwertblöcke (eawz). Pro Muster
werden je nach Ausgabe ~21–32 der 40 Felder automatisch befüllt.

**Funktionsweise:** pdf.js rekonstruiert aus den 2D-Textpositionen layouttreue Zeilen; Spalten werden an
größeren Lücken getrennt. Energie-Kennzahlen werden über den spezifischen kWh/m²a-Wert erkannt,
Geometriewerte über „Label → Wert + Einheit". Die OIB-Ausgabe (z. B. „März 2015", „April 2019") wird aus
dem Dokument gelesen, nicht geraten.

## Grenzen (ehrlich)

- **Heuristische Extraktion.** Trifft nicht 100 % bei exotischen Layouts → bewusst leer/`MANUELL` statt
  falscher Zahlen. **Werte vor Verwendung sichten.**
- **Keine OCR.** Gescannte PDFs werden nur als `MANUELL` markiert, nicht ausgelesen.
- RK/SK-Spalten sind nur befüllt, wenn der Ausweis den Standortklima-Wert explizit ausweist.
- Österreichische Dezimalkommas (`45,6`) werden zu Zahlen normalisiert (`45.6`).

## Entwicklung / Neu bauen

Die ausgelieferte `dist/index.html` ist **eine** Datei mit eingebetteten Bibliotheken
(pdf.js + SheetJS, offline). Quelle ist `src/app.template.html`; der Build inlinet `vendor/*.js`:

```bash
python3 build.py     # -> dist/index.html
```

Bibliotheken in `vendor/` (committet, damit der Build offline reproduzierbar ist):
- `pdf.min.js` + `pdf.worker.min.js` — pdf.js 3.11.174 (Apache-2.0)
- `xlsx.full.min.js` — SheetJS 0.20.3 (Apache-2.0)

### Erkennung anpassen
Die Extraktions-Engine steht in `src/app.template.html`:
- **`COLUMNS`** — Spaltensatz (Reihenfolge = Excel-Reihenfolge).
- **`extract()`** — pro Feld ein Aufruf: `byLabel(...)` (Label→Wert-Zelle), `metric(...)`
  (Energie-Kennzahl), oder ein direkter Regex.
- **`isEnergieausweis()`** — Schwelle, ab der eine Datei als Ausweis gilt (sonst übersprungen).

Neuen Aussteller-Stil ergänzen → `python3 build.py` → neu testen.
