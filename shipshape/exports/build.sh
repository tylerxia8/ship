#!/usr/bin/env bash
# Regenerate the DOCX + PDF exports from the source markdown.
# Run from any directory; paths are resolved relative to repo root.
#
# Requires: Node 20+, Chrome installed (for headless PDF rendering).
# On Windows, may need:
#   PUPPETEER_EXECUTABLE_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ./build.sh

set -euo pipefail

# Resolve repo root from script location (works regardless of cwd).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$SCRIPT_DIR"

cd "$REPO_ROOT"

# Source markdown → output basename.
declare -A DOCS=(
  ["shipshape/AT_A_GLANCE.md"]="AT_A_GLANCE"
  ["shipshape/audit/AUDIT_REPORT.md"]="AUDIT_REPORT"
  ["shipshape/SUBMISSION.md"]="SUBMISSION"
)

echo "==> DOCX (pandoc-bin)"
for src in "${!DOCS[@]}"; do
  base="${DOCS[$src]}"
  echo "  $src -> $OUT_DIR/$base.docx"
  corepack pnpm dlx pandoc-bin -f markdown+pipe_tables -t docx \
    -o "$OUT_DIR/$base.docx" "$src"
done

echo "==> PDF (md-to-pdf via Puppeteer / headless Chrome)"
# md-to-pdf writes the PDF alongside the source; we move it after.
for src in "${!DOCS[@]}"; do
  base="${DOCS[$src]}"
  src_dir="$(dirname "$src")"
  echo "  $src -> $OUT_DIR/$base.pdf"
  corepack pnpm dlx md-to-pdf "$src"
  mv "$src_dir/$base.pdf" "$OUT_DIR/$base.pdf"
done

echo "==> done"
ls -lh "$OUT_DIR"/*.docx "$OUT_DIR"/*.pdf
