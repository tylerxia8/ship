import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const runs = Number(process.env.PLUGFORGE_FLAKE_RUNS ?? 20);
const output = process.env.PLUGFORGE_FLAKE_OUTPUT || 'test-results/plugforge-flake-proof.json';
const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'corepack.cmd pnpm plugforge:flows']
  : ['pnpm', 'plugforge:flows'];
const failures = [];
const timings = [];

for (let run = 1; run <= runs; run += 1) {
  const started = Date.now();
  console.log(`Plugforge flake drill run ${run}/${runs}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const elapsedMs = Date.now() - started;
  timings.push({
    run,
    ok: result.status === 0,
    elapsed_ms: elapsedMs,
  });

  if (result.status !== 0) {
    failures.push({
      run,
      status: result.status,
      elapsed_ms: elapsedMs,
      error: result.error?.message,
    });
  }
}

const proof = {
  runs,
  failures: failures.length,
  flake_rate: failures.length / runs,
  target_flake_rate: 0,
  passed: failures.length === 0,
  generated_at: new Date().toISOString(),
  timings,
};
console.log(JSON.stringify(proof, null, 2));
mkdirSync(output.replace(/[\\/][^\\/]+$/, '') || '.', { recursive: true });
writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  throw new Error(`Plugforge drill flaked ${failures.length}/${runs} runs`);
}
