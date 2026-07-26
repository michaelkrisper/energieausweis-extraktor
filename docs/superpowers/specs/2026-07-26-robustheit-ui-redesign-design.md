# Design: App-Robustheit + UI-Redesign (2026-07-26)

## Ziel
Maximale Robustheit beim Einlesen + modernes, professionelles, einfaches Frontend.
Weiterhin: eine Offline-HTML-Datei, keine Server, keine Daten verlassen den Rechner.

## Nicht-Ziele
- Keine Änderungen an der Extraktions-Engine (`const NUM_KEYS` … `// ---- State`):
  1529 Assertions sind grün; Engine-Änderungen nur mit neuen Sample-PDFs (Workflow lt. CLAUDE.md).
- Keine OCR, keine neuen Abhängigkeiten.

## Robustheit (Scan-Pipeline)
- **Passwortgeschützte PDFs**: `PasswordException` → Status `MANUELL · passwortgeschützt` statt kryptischem Lesefehler.
- **Fehlertolerante Ordner-Iteration**: ein nicht lesbarer Unterordner (Rechte, Netzlaufwerk) bricht den Scan nicht mehr ab.
- **Abbrechen-Button**: laufender Scan stoppbar, Teilergebnis bleibt erhalten.
- **Drag & Drop**: Ordner oder einzelne PDFs aufs Fenster ziehen (File System Access Handles; Fallback `dataTransfer.files`).
- **Browser-Fallback**: ohne `showDirectoryPicker` (Firefox/Safari) öffnet „Ordner wählen" ein `<input webkitdirectory>` — die App läuft damit erstmals auch außerhalb Chromiums.
- **„nur ENERGIE-Ordner"-Schalter**: bisherige Einschränkung bleibt Default, ist aber abschaltbar (alle Ordner scannen).
- **Verlust-Schutz**: `beforeunload`-Warnung, solange Daten/Änderungen in der Tabelle stehen.
- **Fortschritt**: Balken + „n / m · dateiname.pdf".
- Fix: toter `row.hwb_sk`-Check in der Statuslogik (Schlüssel existiert nicht) → `hwb_ref_sk`.

## UI-Redesign
- Design-Tokens (CSS Custom Properties), helles + dunkles Theme (`prefers-color-scheme`).
- Header mit Marke, Datenschutz-Hinweis, Energieklassen-Farbleiste als Akzent.
- Toolbar-Karte: Ordner wählen / Abbrechen / Excel-Export, Suche, Statusfilter,
  „leere Spalten ausblenden" (Default an — bei 77 Union-Spalten sonst unübersichtlich; Export enthält immer alle Spalten),
  „nur ENERGIE-Ordner", Statistik-Pills.
- Empty-State = große Dropzone mit Anleitung statt Fließtext-Hinweis.
- Tabelle: sticky Kopf + Dateispalte, Zebra, Zahlen rechtsbündig (`tabular-nums`),
  Status als Badge, **Sortierung per Klick auf Spaltenkopf** (numerisch für Zahlenspalten, Leere ans Ende),
  editierte Zellen markiert.
- Toasts statt blockierender `alert()`.

## Architektur
Alles in `src/app.template.html`; Engine-Block und `pdfToText` bleiben byte-identisch
(validate.js eval()t den Slice, pdfToText ist 1:1 mit dem Test-Harness gehalten).
Scan-Quellen (Picker / Drop / Input-Fallback) liefern ein einheitliches
`{name, path, getFile()}`-Listenformat an eine gemeinsame `runScan()`-Pipeline.

## Verifikation
`node test/validate.js test/samples` (100 % Pflicht) → `python3 build.py` → Sichtprüfung dist.
