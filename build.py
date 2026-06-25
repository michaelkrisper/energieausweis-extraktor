#!/usr/bin/env python3
"""Backt vendor/*.js inline in src/app.template.html -> dist/index.html (eine portable Datei, offline)."""

from pathlib import Path

ROOT = Path(__file__).parent
tpl = (ROOT / "src" / "app.template.html").read_text(encoding="utf-8")


def lib(name: str) -> str:
    return (ROOT / "vendor" / name).read_text(encoding="utf-8")


# Sanity: keine </script> in den Libs (würde Inline-Embed brechen)
for f in ("pdf.min.js", "pdf.worker.min.js", "xlsx.full.min.js"):
    if "</script" in lib(f).lower():
        raise SystemExit(
            f"FEHLER: {f} enthaelt </script> -> kann nicht inline eingebettet werden"
        )

out = tpl
out = out.replace("<!--__PDFJS__-->", "<script>\n" + lib("pdf.min.js") + "\n</script>")
out = out.replace(
    "<!--__SHEETJS__-->", "<script>\n" + lib("xlsx.full.min.js") + "\n</script>"
)
out = out.replace(
    "<!--__PDFWORKER__-->",
    '<script type="text/plain" id="pdfworker">\n'
    + lib("pdf.worker.min.js")
    + "\n</script>",
)

dist = ROOT / "dist" / "index.html"
dist.write_text(out, encoding="utf-8")
kb = dist.stat().st_size // 1024
print(f"OK -> {dist}  ({kb} KB)")
