import { spawnSync } from 'node:child_process';

const runs = Number(process.env.PLUGFORGE_FLAKE_RUNS ?? 20);
const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'corepack.cmd pnpm plugforge:flows']
  : ['pnpm', 'plugforge:flows'];
const failures = [];

for (let run = 1; run <= runs; run += 1) {
  const started = Date.now();
  console.log(`Plugforge flake drill run ${run}/${runs}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const elapsedMs = Date.now() - started;

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
};
console.log(JSON.stringify(proof, null, 2));

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  throw new Error(`Plugforge drill flaked ${failures.length}/${runs} runs`);
}
