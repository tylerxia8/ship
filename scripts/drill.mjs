#!/usr/bin/env node
import crypto from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..');

function usage() {
  console.log(`Ship drill harness

Usage:
  pnpm drill ttfe [--no-docker]

Environment:
  SHIP_URL          Existing Ship base URL. If omitted, Docker mode uses http://localhost:3000.
  SHIP_TOKEN        Existing public API bearer token. If omitted in Docker mode, a temporary token is bootstrapped.
  TTFE_TARGET_MS    Failing threshold, default 60000.
  KEEP_DOCKER       Set to 1 to leave the Docker stack running.
  KEEP_DRILL_WORKDIR Set to 1 to keep the temporary clean SDK install directory.
`);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const commandName = process.platform === 'win32' && command === 'corepack' ? 'cmd.exe' : command;
    const commandArgs = process.platform === 'win32' && command === 'corepack'
      ? ['/d', '/s', '/c', 'corepack.cmd', ...args]
      : args;
    const child = spawn(commandName, commandArgs, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'pipe',
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (options.echo) process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (options.echo) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const err = new Error(`${command} ${args.join(' ')} exited with ${code}`);
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
  });
}

async function timed(name, fn, timings) {
  const started = Date.now();
  const value = await fn();
  timings[name] = Date.now() - started;
  return value;
}

async function installSdkInCleanDir(timings) {
  const workdir = join(tmpdir(), `ship-ttfe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  await mkdir(workdir, { recursive: true });
  let packagePath = '';

  await timed('install', async () => {
    await run('corepack', ['pnpm', '--filter', '@ship/sdk', 'build'], { echo: true });
    const pack = await run('corepack', ['pnpm', '--filter', '@ship/sdk', 'pack', '--pack-destination', workdir]);
    const packedName = pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
    if (!packedName) throw new Error('Could not determine packed @ship/sdk tarball name');
    const tarballPath = resolve(workdir, packedName);

    await writeFile(join(workdir, 'package.json'), JSON.stringify({
      private: true,
      type: 'module',
      packageManager: 'pnpm@10.27.0',
      dependencies: {},
    }, null, 2));
    await run('corepack', ['pnpm', 'add', tarballPath], { cwd: workdir, echo: true });
    packagePath = join(workdir, 'node_modules', '@ship', 'sdk', 'dist', 'index.js');
  }, timings);

  return { workdir, packagePath };
}

async function waitForHealth(shipUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${shipUrl}/health`);
      if (response.ok) return;
    } catch {
      // Keep waiting while Docker builds and the seed script runs.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
  }
  throw new Error(`Timed out waiting for ${shipUrl}/health`);
}

async function bootstrapDockerToken() {
  const token = `ship_at_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const clientId = `ship_app_drill_${crypto.randomBytes(8).toString('hex')}`;

  const sql = `
WITH ctx AS (
  SELECT u.id AS user_id, w.id AS workspace_id
    FROM users u
    JOIN workspaces w ON w.id = u.last_workspace_id
   WHERE LOWER(u.email) = 'dev@ship.local'
   LIMIT 1
), app AS (
  INSERT INTO oauth_apps (workspace_id, owner_user_id, name, client_id, client_secret_hash, redirect_uris, requested_scopes)
  SELECT workspace_id, user_id, 'TTFE Drill App', '${clientId}', 'drill-bootstrap-secret-hash',
         ARRAY['http://127.0.0.1/callback']::text[],
         ARRAY['documents:read','documents:write','webhooks:manage']::text[]
    FROM ctx
  RETURNING id, workspace_id, owner_user_id
), family AS (
  INSERT INTO oauth_token_families (app_id, user_id, workspace_id)
  SELECT id, owner_user_id, workspace_id FROM app
  RETURNING id, app_id, user_id, workspace_id
)
INSERT INTO oauth_access_tokens (token_hash, app_id, token_family_id, user_id, workspace_id, scopes, expires_at)
SELECT '${tokenHash}', app_id, id, user_id, workspace_id,
       ARRAY['documents:read','documents:write','webhooks:manage']::text[],
       NOW() + INTERVAL '30 minutes'
  FROM family
RETURNING id;
`;

  await run('docker', ['compose', '-f', 'docker-compose.local.yml', 'exec', '-T', 'postgres', 'psql', '-U', 'ship', '-d', 'ship_dev', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { echo: true });
  return token;
}

async function runTtfe(args) {
  const timings = {};
  const noDocker = args.includes('--no-docker');
  const useDocker = !noDocker && (!process.env.SHIP_URL || !process.env.SHIP_TOKEN || process.env.DRILL_USE_DOCKER === '1');
  const install = await installSdkInCleanDir(timings);

  let shipUrl = process.env.SHIP_URL;
  let token = process.env.SHIP_TOKEN;

  try {
    if (useDocker) {
      await timed('container_boot', async () => {
        await run('docker', ['compose', '-f', 'docker-compose.local.yml', 'up', '-d', '--build', 'postgres', 'api'], { echo: true });
        shipUrl = shipUrl || 'http://localhost:3000';
        await waitForHealth(shipUrl);
      }, timings);

      if (!token) {
        token = await timed('login', bootstrapDockerToken, timings);
      }
    }

    if (!shipUrl) shipUrl = 'http://localhost:3000';
    if (!token) {
      throw new Error('SHIP_TOKEN is required when running the drill with --no-docker.');
    }

    await run(process.execPath, ['scripts/plugforge-ttfe-drill.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SHIP_URL: shipUrl,
        SHIP_TOKEN: token,
        TTFE_INSTALLED_SDK_PATH: install.packagePath,
        TTFE_INSTALL_MS: String(timings.install),
        TTFE_LOGIN_MS: timings.login == null ? '' : String(timings.login),
        WEBHOOK_LISTEN_HOST: useDocker ? '0.0.0.0' : (process.env.WEBHOOK_LISTEN_HOST || '127.0.0.1'),
        WEBHOOK_PUBLIC_HOST: useDocker ? 'host.docker.internal' : (process.env.WEBHOOK_PUBLIC_HOST || '127.0.0.1'),
      },
    });
  } finally {
    if (useDocker && process.env.KEEP_DOCKER !== '1') {
      await run('docker', ['compose', '-f', 'docker-compose.local.yml', 'down', '-v'], { echo: true }).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
      });
    }
    if (process.env.KEEP_DRILL_WORKDIR !== '1') {
      await rm(install.workdir, { recursive: true, force: true });
    } else {
      console.log(`Kept drill workdir: ${install.workdir}`);
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(command ? 0 : 1);
}

if (command !== 'ttfe') {
  usage();
  console.error(`Unknown drill: ${command}`);
  process.exit(1);
}

runTtfe(args).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
