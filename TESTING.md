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
# eigene PDFs in einen Ordner legen, z.B. test/samples/ (gitignored)
node test/validate.js test/samples
# oder einen beliebigen Ordner:
node test/validate.js /pfad/zu/energieausweisen
```

Ausgabe je PDF: ob es als Energieausweis erkannt wird (sonst `ÜBERSPRUNGEN`), die Feld-Abdeckung und
die wichtigsten Werte (HWB, fGEE, OIB-Ausgabe, PLZ/Ort). So sieht man sofort, ob ein neues
Aussteller-Format korrekt gelesen wird.

> pdf.js gibt auf der Konsole harmlose Font-Warnungen aus (`fetchStandardFontData …`,
> `Cannot polyfill DOMMatrix`). Mit `2>/dev/null` ausblenden.

## Geprüfter Stand

Validiert gegen echte Muster mehrerer Aussteller-Programme/Ausgaben (GEQ, eawz, ILS ZT Gleisdorf/Stmk,
e-s-e, FIBY ZT, klimafonds), Dokument-Baujahre 2010–2024. Zwei Layout-Familien abgedeckt:
klassische Tabellen (inkl. LEK) und moderne OIB-2015+-Kennwertblöcke. Je nach Ausgabe werden
~19–27 der 40 Felder automatisch korrekt befüllt; keine Vorzeichen- oder Label-Verklebungs-Fehler.

Bewusste Grenzen: gescannte PDFs → `MANUELL` (keine OCR). RK/SK-Spalten nur, wenn der Ausweis den
Standortklima-Wert explizit ausweist. Mehrdeutige Mehrseiten-Detailausweise (z. B. 35 Seiten) können
bei doppelt vorkommenden Kennzahlen den falschen Treffer wählen → in der editierbaren Tabelle prüfen.

## Neues Format ergänzen

1. PDF ins Sample-Verzeichnis legen, `node test/validate.js …` laufen lassen.
2. Fehlt/falsch ein Feld → in `src/app.template.html` in `extract()` das passende `byLabel(...)`,
   `metric(...)` oder den Regex anpassen (siehe README → „Erkennung anpassen").
3. `python3 build.py` → erneut validieren → committen.
