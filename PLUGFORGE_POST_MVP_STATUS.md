# PlugForge Post-MVP Status

## Completed After MVP Submission

- Explicit public `/api/v1/issues` routes:
  - `GET /issues`
  - `GET /issues/{id}`
  - `POST /issues`
- Explicit public `/api/v1/sprints` routes:
  - `GET /sprints`
  - `GET /sprints/{id}`
  - `POST /sprints`
- Generated OpenAPI and SDK parity now include issues and sprints as first-class resources.
- `QueueBackedEventBus` implements the same `IEventBus` interface as the in-process event bus, so queue-backed delivery can be swapped in without changing domain publishers.
- SDK package metadata is publish-ready with public scoped publish config, prepack build, package file allowlist, and changelog.
- Frontend deployment script now accepts `shadow`, matching the backend deployment script.
- SSM sync script now prints exact bootstrap commands for missing prod/dev/shadow Terraform config parameters.
- Production backend was redeployed to Elastic Beanstalk version `v20260603152032`.
  The live webhook event registry now exposes all eight required event types.
- The PlugForge flake drill passed 20 consecutive runs with zero failures:
  `corepack.cmd pnpm plugforge:flake` reported `runs: 20`, `failures: 0`,
  and `flake_rate: 0`; the script now writes a JSON proof artifact for CI.
- The pre-commit hook now checks for a compatible `comply opensource` command
  before invoking it, so unrelated `comply` binaries do not break commits.
- GitHub Actions now uploads TTFE and flake proof artifacts from the PlugForge
  drill workflow.
- `corepack.cmd pnpm plugforge:doctor` checks local readiness for Node, pnpm,
  live endpoints, Docker/Testcontainers, AWS CLI, Terraform, PostgreSQL, and a
  compatible `comply opensource` scanner.
- `corepack.cmd pnpm plugforge:sdk-pack` builds and packs the SDK as
  `.tmp/ship-sdk-0.0.0.tgz`.
- `corepack.cmd pnpm plugforge:agent-audit-proof` verifies that a FleetGraph
  OAuth bearer token can call `/api/v1` and that the Developer Portal audit log
  records the app client ID, route, scope, status, and latency.

## Local Verification

```powershell
corepack.cmd pnpm --filter @ship/api plugforge:openapi
corepack.cmd pnpm --filter @ship/api plugforge:fitness
corepack.cmd pnpm plugforge:flake
corepack.cmd pnpm plugforge:doctor
corepack.cmd pnpm plugforge:sdk-pack
corepack.cmd pnpm plugforge:agent-audit-proof
```

Latest local fitness result:

- `fitness.test.ts`: 8 tests passed.
- `platform.test.ts`: 25 tests passed.
- `plugforge:flake`: 20 runs passed, 0 failures, flake rate 0.
- `plugforge:doctor`: required checks passed; optional readiness gaps were
  Docker, AWS CLI, Terraform, PostgreSQL CLI, and compatible `comply`.
- `plugforge:sdk-pack`: produced `.tmp/ship-sdk-0.0.0.tgz`.
- `plugforge:agent-audit-proof`: live audit row captured for
  `ship_app_d8200057ae8afcd914151e0738af09f3`, route `/api/v1/documents/`,
  scope `documents:read`, status `200`, latency `5ms`.

## Remaining External Blockers

- AWS CLI is not available in the current shell. Deployment was completed with
  a temporary AWS SDK helper instead.
- Terraform is not available in the current shell.
- Docker Desktop is installed, but the Linux engine is currently unhealthy in
  this workstation session. `docker version` returns client metadata but a
  server-side 500 for `dockerDesktopLinuxEngine`.
- `bash.exe` resolves to WSL, but WSL cannot launch `/bin/bash` in this session,
  so the Bash deployment scripts cannot run here.
- Full Playwright E2E was launched through the progress reporter with one
  worker and redirected logs. It exited during global setup after a low-memory
  warning and before `test-results/summary.json` was written; because the suite
  uses Testcontainers for each worker, the unhealthy Docker engine remains the
  blocker for the complete 600+ test regression proof.
- The PyPI package named `comply-cli` installs a `comply` binary, but it does
  not expose the repository's expected `comply opensource` subcommand. The hook
  now detects this mismatch and prints the same non-blocking warning used when
  the command is absent.

Production SSM Terraform config exists for the deployed environment, but local
AWS CLI/Terraform workstation setup is still needed for the standard scripts:

```powershell
aws ssm get-parameter --name /ship/terraform-config/environment
terraform -chdir=infra plan
```

Shadow deploy still requires its shadow-prefixed SSM parameters before the
standard script can run:

```powershell
aws ssm put-parameter --name /ship/terraform-config/shadow/environment --value shadow --type String
```

- NPM publish requires npm authentication:

```powershell
corepack.cmd pnpm --filter @ship/sdk pack --pack-destination .tmp
corepack.cmd pnpm --filter @ship/sdk publish --access public
```
