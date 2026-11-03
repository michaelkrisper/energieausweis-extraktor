#!/usr/bin/env python3
"""Inline vendor/*.js into src/app.template.html -> dist/index.html (one portable offline file)."""

from pathlib import Path

ROOT = Path(__file__).parent
LIBS = ("pdf.min.mjs", "pdf.worker.min.mjs", "xlsx.full.min.js")


def lib(name: str) -> str:
    return (ROOT / "vendor" / name).read_text(encoding="utf-8")


def build() -> Path:
    tpl = (ROOT / "src" / "app.template.html").read_text(encoding="utf-8")
    code = {f: lib(f) for f in LIBS}
    # A literal </script> inside a library would terminate the inline embed.
    for f, src in code.items():
        if "</script" in src.lower():
            raise SystemExit(f"ERROR: {f} contains </script> and cannot be inlined")
    # pdf.js 6 and its worker are ES modules -> embedded as text/plain; the template turns them
    # into Blob URLs at runtime and loads them via import() (a classic <script> cannot run ESM).
    blocks = {
        "<!--__PDFJS__-->": '<script type="text/plain" id="pdfmodule">\n'
        + code["pdf.min.mjs"]
        + "\n</script>",
        "<!--__SHEETJS__-->": "<script>\n" + code["xlsx.full.min.js"] + "\n</script>",
        "<!--__PDFWORKER__-->": '<script type="text/plain" id="pdfworker">\n'
        + code["pdf.worker.min.mjs"]
        + "\n</script>",
    }
    out = tpl
    for marker, block in blocks.items():
        if marker not in out:
            raise SystemExit(f"ERROR: placeholder {marker} missing in template")
        out = out.replace(marker, block)
    dist = ROOT / "dist" / "index.html"
    dist.write_text(out, encoding="utf-8")
    return dist


if __name__ == "__main__":
    dist = build()
    print(f"OK -> {dist}  ({dist.stat().st_size // 1024} KB)")
