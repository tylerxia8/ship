import { spawnSync } from 'node:child_process';

const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
if (gitDir.status === 0) {
  spawnSync('git', ['config', 'merge.ours.driver', 'true'], { stdio: 'ignore' });
}

const result = spawnSync('comply', ['opensource', '--help'], { stdio: 'ignore' });

if (result.status !== 0) {
  console.log(`
WARNING: compatible 'comply opensource' CLI not installed - pre-commit hooks require it
   Install the compliance-toolkit CLI that provides: comply opensource
`);
}
