#!/usr/bin/env python3
"""Backt vendor/*.js inline in src/app.template.html -> dist/index.html (eine portable Datei, offline)."""

from pathlib import Path

ROOT = Path(__file__).parent
tpl = (ROOT / "src" / "app.template.html").read_text(encoding="utf-8")


def lib(name: str) -> str:
    return (ROOT / "vendor" / name).read_text(encoding="utf-8")


# Sanity: keine </script> in den Libs (würde Inline-Embed brechen)
for f in ("pdf.min.mjs", "pdf.worker.min.mjs", "xlsx.full.min.js"):
    if "</script" in lib(f).lower():
        raise SystemExit(
            f"FEHLER: {f} enthaelt </script> -> kann nicht inline eingebettet werden"
        )

out = tpl
# pdf.js 6 ist ein ES-Modul -> als text/plain einbetten; das Template baut daraus zur Laufzeit
# einen Blob und importiert es dynamisch (import()). Klassisches <script> wuerde ESM nicht laden.
out = out.replace(
    "<!--__PDFJS__-->",
    '<script type="text/plain" id="pdfmodule">\n' + lib("pdf.min.mjs") + "\n</script>",
)
out = out.replace(
    "<!--__SHEETJS__-->", "<script>\n" + lib("xlsx.full.min.js") + "\n</script>"
)
out = out.replace(
    "<!--__PDFWORKER__-->",
    '<script type="text/plain" id="pdfworker">\n'
    + lib("pdf.worker.min.mjs")
    + "\n</script>",
)

dist = ROOT / "dist" / "index.html"
dist.write_text(out, encoding="utf-8")
kb = dist.stat().st_size // 1024
print(f"OK -> {dist}  ({kb} KB)")
