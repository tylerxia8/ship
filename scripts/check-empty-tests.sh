#!/bin/bash
#
# Check for empty Playwright tests (tests with only TODO comments)
#
# Empty tests pass silently, which is a footgun. This script fails if any
# test body contains only a // TODO: comment without actual test logic.
#
# SOLUTION: Use test.fixme() for stub tests instead of empty test bodies:
#   test.fixme('my test', async ({ page }) => {
#     // TODO: implement this test
#   });
#

set -e

E2E_DIR="${1:-e2e}"

if [ ! -d "$E2E_DIR" ]; then
  echo "E2E directory not found: $E2E_DIR"
  exit 0
fi

# Find tests that are empty (no expect() or page. calls).
# Uses stateful awk parsing to track test bodies.
# Excludes test.fixme/test.skip/test.todo which are proper stub markers.

found_empty=0
declare -a files_with_empty

for f in "$E2E_DIR"/*.spec.ts; do
  if [ ! -f "$f" ]; then
    continue
  fi

  # Use awk for stateful parsing of test bodies.
  # We track brace depth so nested arrow functions (e.g. `context.route(..., async () => {...})`)
  # are not misread as the end of the outer test body.
  empty_count=$(awk '
    {
      # Count braces on this line. gsub returns the substitution count;
      # replacing the matched char with itself leaves $0 unchanged but yields the count.
      n_open  = gsub(/\{/, "&", $0)
      n_close = gsub(/\}/, "&", $0)

      if (in_test) {
        body_depth += n_open - n_close
        if ($0 ~ /expect\(/) has_content = 1
        if ($0 ~ /page\./)   has_content = 1
        # End of test body is when we close a brace AND depth returns to zero.
        # Requiring n_close > 0 prevents the test from "ending" on a content-only
        # line that happens to be at depth 0 due to non-canonical formatting.
        if (body_depth == 0 && n_close > 0) {
          if (!has_content) empty_count++
          in_test = 0
        }
      } else if (/^[[:space:]]*test\(/ && !/test\.fixme/ && !/test\.skip/ && !/test\.todo/) {
        in_test = 1
        has_content = 0
        body_depth = n_open - n_close
        # If the test() declaration is balanced on its own line (rare; multi-line
        # declarations), keep scanning until we see the body open.
        if (body_depth == 0) in_test = 0
      }
    }
    END { print empty_count + 0 }
  ' "$f")

  if [ "$empty_count" -gt 0 ]; then
    found_empty=1
    files_with_empty+=("$empty_count empty tests in $(basename "$f")")
  fi
done

if [ "$found_empty" -eq 1 ]; then
  echo ""
  echo "ERROR: Empty tests detected!"
  echo "========================================"
  echo ""
  echo "The following tests have only TODO comments and will SILENTLY PASS:"
  echo ""

  for msg in "${files_with_empty[@]}"; do
    echo "  $msg"
  done

  echo ""
  echo "FIX: Convert empty tests to test.fixme():"
  echo ""
  echo "  // WRONG - silently passes"
  echo "  test('my test', async ({ page }) => {"
  echo "    // TODO: implement"
  echo "  });"
  echo ""
  echo "  // RIGHT - shows as 'fixme' in report"
  echo "  test.fixme('my test', async ({ page }) => {"
  echo "    // TODO: implement"
  echo "  });"
  echo ""
  exit 1
fi

echo "No empty tests found."
