#!/usr/bin/env bash
# ShipShape autocannon sweep — averaged across N runs per cell.
#
# Default audit run was 1 run per (endpoint, conn). The headline numbers
# are clean but two c=25 rows showed transient single-request stalls
# (autovacuum or cold-cache page faults inside the 10s window). This
# script averages 3 runs per cell to flatten those out, then writes one
# JSON-stats summary per endpoint.
#
# Run from the repo root, with the dev API up on :3000 and a Bearer
# token at shipshape/audit/raw/.api_token. SHIPSHAPE_AUDIT=1 must be
# set on the API so the dev rate limiter is bypassed (1000/min cap
# would dominate at high concurrency).
#
# Usage:
#   shipshape/audit/scripts/perf-sweep.sh [OUT_DIR] [RUNS]
#
# OUT_DIR defaults to shipshape/improvements/raw/perf-after-v2/
# RUNS    defaults to 3
set -euo pipefail

OUT_DIR="${1:-shipshape/improvements/raw/perf-after-v2}"
RUNS="${2:-3}"
DURATION="${DURATION:-10}"

TOK=$(cat shipshape/audit/raw/.api_token | tr -d '\r\n ')
if [ -z "$TOK" ]; then
  echo "ERROR: shipshape/audit/raw/.api_token is empty"
  exit 1
fi

mkdir -p "$OUT_DIR"

declare -A endpoints=(
  [auth_me]="/api/auth/me"
  [docs_wiki]="/api/documents?type=wiki"
  [issues]="/api/issues"
  [my_work]="/api/dashboard/my-work"
  [weeks]="/api/weeks"
)

for name in auth_me docs_wiki issues my_work weeks; do
  path=${endpoints[$name]}
  for c in 10 25 50; do
    for run in $(seq 1 "$RUNS"); do
      out="$OUT_DIR/${name}_c${c}_run${run}.json"
      echo "[$(date +%H:%M:%S)] $name c=$c run=$run/$RUNS"
      corepack pnpm dlx autocannon@latest \
        -c "$c" -d "$DURATION" \
        -H "Authorization: Bearer $TOK" \
        -j "http://localhost:3000${path}" \
        > "$out" 2>&1
    done
  done
done

echo
echo "Sweep complete. Aggregating..."

# Aggregate via Node — average the latency percentiles + RPS across the
# RUNS runs per (endpoint, conn) cell.
node -e "
const fs = require('fs');
const path = require('path');
const dir = process.argv[1];
const runs = parseInt(process.argv[2], 10);
const endpoints = ['auth_me','docs_wiki','issues','my_work','weeks'];
const conns = [10, 25, 50];
const summary = {};
const fields = ['p50','p90','p97_5','p99'];

for (const name of endpoints) {
  for (const c of conns) {
    const cell = { p50: [], p90: [], p97_5: [], p99: [], max: [], rps: [], non2xx: 0 };
    let parsed = 0;
    for (let r = 1; r <= runs; r++) {
      const f = path.join(dir, \`\${name}_c\${c}_run\${r}.json\`);
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (d.non2xx > 0) cell.non2xx += d.non2xx;
        for (const k of fields) if (d.latency?.[k] != null) cell[k].push(d.latency[k]);
        if (d.latency?.max != null) cell.max.push(d.latency.max);
        if (d.requests?.average != null) cell.rps.push(d.requests.average);
        parsed++;
      } catch (e) {
        // file missing or malformed — skip silently
      }
    }
    const avg = arr => arr.length === 0 ? null : Math.round(arr.reduce((a,b)=>a+b,0) / arr.length * 10) / 10;
    summary[\`\${name}_c\${c}\`] = {
      runs_parsed: parsed,
      p50: avg(cell.p50), p90: avg(cell.p90), p97_5: avg(cell.p97_5), p99: avg(cell.p99),
      max_max: cell.max.length ? Math.max(...cell.max) : null,
      rps_avg: avg(cell.rps),
      non2xx: cell.non2xx,
    };
  }
}

fs.writeFileSync(path.join(dir, '_summary.json'), JSON.stringify(summary, null, 2));

console.log('Endpoint     c   runs  P50    P90    P97.5  P99    Max    RPS    non2xx');
console.log('-'.repeat(80));
for (const k of Object.keys(summary)) {
  const s = summary[k];
  const [name, cStr] = k.split('_c');
  console.log(
    name.padEnd(12), cStr.padStart(3), String(s.runs_parsed).padStart(5),
    String(s.p50).padStart(6), String(s.p90).padStart(6),
    String(s.p97_5).padStart(6), String(s.p99).padStart(6),
    String(s.max_max).padStart(6), String(Math.round(s.rps_avg)).padStart(6),
    String(s.non2xx).padStart(6)
  );
}
" "$OUT_DIR" "$RUNS" | tee "$OUT_DIR/_summary.txt"

echo
echo "Summary at $OUT_DIR/_summary.json + $OUT_DIR/_summary.txt"
