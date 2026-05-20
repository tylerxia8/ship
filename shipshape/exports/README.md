# Printable exports

The same three reviewer documents, exported to DOCX and PDF for easy reading offline / printing / sharing without GitHub access.

| Source markdown | DOCX | PDF | Pages |
|---|---|---|---|
| [shipshape/AT_A_GLANCE.md](../AT_A_GLANCE.md) | [AT_A_GLANCE.docx](AT_A_GLANCE.docx) | [AT_A_GLANCE.pdf](AT_A_GLANCE.pdf) | 8 |
| [shipshape/audit/AUDIT_REPORT.md](../audit/AUDIT_REPORT.md) | [AUDIT_REPORT.docx](AUDIT_REPORT.docx) | [AUDIT_REPORT.pdf](AUDIT_REPORT.pdf) | 8 |
| [shipshape/audit/COMPREHENSIVE_AUDIT.md](../audit/COMPREHENSIVE_AUDIT.md) | [COMPREHENSIVE_AUDIT.docx](COMPREHENSIVE_AUDIT.docx) | [COMPREHENSIVE_AUDIT.pdf](COMPREHENSIVE_AUDIT.pdf) | ~7 |
| [shipshape/SUBMISSION.md](../SUBMISSION.md) | [SUBMISSION.docx](SUBMISSION.docx) | [SUBMISSION.pdf](SUBMISSION.pdf) | 7 |

The markdown is the source of truth; these are convenience snapshots taken at the moment of submission. If the markdown changes after this, regenerate with `./build.sh` from this directory.

## Regenerate

```bash
./build.sh
```

Requires: Node (for `corepack`), Chrome (for headless PDF rendering). On Windows you may need to set the Chrome path:

```bash
PUPPETEER_EXECUTABLE_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ./build.sh
```

## Tools used

- **DOCX**: `corepack pnpm dlx pandoc-bin -f markdown+pipe_tables -t docx` — pandoc directly.
- **PDF**: `corepack pnpm dlx md-to-pdf` — Markdown-it + Puppeteer (headless Chrome).

Both are zero-install; the first invocation downloads them to the pnpm dlx cache.
