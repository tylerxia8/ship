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

## Local Verification

```powershell
corepack.cmd pnpm --filter @ship/api plugforge:openapi
corepack.cmd pnpm --filter @ship/api plugforge:fitness
```

Latest local fitness result:

- `fitness.test.ts`: 8 tests passed.
- `platform.test.ts`: 25 tests passed.

## Remaining External Blockers

- AWS CLI is not available in the current shell, so deployment and SSM bootstrap
  cannot be executed from this environment.
- Terraform is not available in the current shell.
- Docker is available.
- `bash.exe` resolves to WSL, but WSL cannot launch `/bin/bash` in this session,
  so the Bash deployment scripts cannot run here.
- Production deploy still requires SSM Terraform config to exist:

```powershell
aws ssm put-parameter --name /ship/terraform-config/environment --value prod --type String
```

- Shadow deploy requires:

```powershell
aws ssm put-parameter --name /ship/terraform-config/shadow/environment --value shadow --type String
```

- NPM publish requires npm authentication:

```powershell
corepack.cmd pnpm --filter @ship/sdk pack --pack-destination .tmp
corepack.cmd pnpm --filter @ship/sdk publish --access public
```
