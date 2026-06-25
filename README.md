# GBG · Energieausweis-Extraktor

Liest österreichische **Energieausweis-PDFs** rekursiv aus einem Ordnerbaum, extrahiert die
OIB-Kennzahlen und exportiert alles vereinheitlicht nach **Excel** — komplett **lokal im Browser**,
kein Server, keine Installation, keine Daten verlassen den Rechner.

## Benutzung (für Anwender)

1. `dist/index.html` auf den Rechner kopieren und in **Microsoft Edge** (oder Chrome) öffnen
   — Doppelklick genügt.
2. **„📁 Ordner wählen"** → den Wurzelordner wählen. Es werden **nur Ordner durchsucht, die
   `ENERGIE` im Namen tragen** (Teilbaum inklusive; Dateinamen sind egal).
3. Tabelle prüfen. **Jede Zelle ist editierbar** — Erkennungsfehler direkt korrigieren.
4. **„⬇ Excel exportieren"** → fertige `.xlsx`.

### Status-Spalte
- `OK · n/5 Kennzahlen` — automatisch erkannt, n von 5 Hauptkennzahlen (HWB/fGEE/PEB/EEB/CO₂) gefunden.
- `MANUELL · kein Text (Scan?)` — PDF hat keine Textebene (eingescannt) → von Hand erfassen.
- `MANUELL · Kennzahlen nicht gefunden` — Format weicht zu stark ab → von Hand prüfen.

> **Browser:** Nur Chromium-basiert (Edge/Chrome). Firefox kann keine Ordner einlesen.

## Extrahierte Felder

Datei · Status · Adresse · PLZ/Ort · Katastralgemeinde · Grundstücksnr · Gebäudekategorie ·
**OIB-Ausgabe** (z. B. „März 2015", „April 2019") · Baujahr · Brutto-Grundfläche · kond./Bezugsfläche ·
HWB Ref · HWB SK · HWB-Klasse · PEB · EEB · fGEE · CO₂ · Energieträger · Ausstelldatum · Gültig bis ·
Aussteller · Pfad.

## Grenzen (ehrlich)

- **Heuristische Extraktion** (Regex pro Feld, mehrere Aussteller-Aliasse). Trifft nicht 100 % bei
  exotischen Layouts → bewusst der `MANUELL`-Fallback statt falscher Zahlen. **Werte vor Verwendung
  sichten.**
- **Keine OCR.** Gescannte PDFs werden nur als `MANUELL` markiert, nicht ausgelesen.
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

### Feld-Patterns anpassen
Alle Erkennungs-Regex stehen in `src/app.template.html` im Objekt `PATTERNS` (ein Eintrag pro Feld,
Liste = Priorität). Neuen Aussteller-Stil ergänzen → `python3 build.py` → neu testen.
