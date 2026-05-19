# Multi-stage build for Railway (and any platform that builds from git).
#
# The original Treasury deploy flow assumed you ran `pnpm build` locally before
# `docker build`, so the image only contained pre-built dist/. That doesn't work
# when the build host pulls source from git (Railway, Render, etc.) — there is
# no local pre-built dist/. This Dockerfile builds inside the container.
#
# Stage 1 (builder) installs all deps and builds shared+api.
# Stage 2 (runtime) reinstalls --prod-only deps and copies the built artifacts.
# Result: lean image with no dev deps and no source maps in production.

# ───────────────────────────────────────────────────────────────────────────
# Stage 1 — builder
# ───────────────────────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:20-slim AS builder

WORKDIR /app

# Government-VPN-friendly SSL config (matches upstream Dockerfile)
RUN npm config set strict-ssl false
RUN npm install -g pnpm@9.15.4 && pnpm config set strict-ssl false

# Copy lockfile + workspace manifest + every workspace's package.json so pnpm
# can resolve the workspace graph correctly. Without web/package.json,
# pnpm-workspace.yaml's `web` entry would error on install.
# Also copy the root tsconfig.json — api/ and shared/ tsconfigs both extend it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/
COPY web/package.json ./web/

# Full install (with dev deps) so we can run tsc to compile.
# --filter limits to the api + shared workspaces; web is not built here.
RUN pnpm install --frozen-lockfile --filter @ship/api --filter @ship/shared --ignore-scripts

# Now copy source. shared first so it can be built independently.
COPY shared/ ./shared/
COPY api/ ./api/

# Build shared types, then build api.
RUN pnpm --filter @ship/shared build
RUN pnpm --filter @ship/api build

# ───────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime
# ───────────────────────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:20-slim

WORKDIR /app

RUN npm config set strict-ssl false
RUN npm install -g pnpm@9.15.4 && pnpm config set strict-ssl false

# Prod deps only.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @ship/api --filter @ship/shared && pnpm store prune

# Copy built artifacts from builder stage.
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/api/dist ./api/dist

ENV NODE_ENV=production

# Railway injects $PORT at runtime. The Express server in api/src/index.ts
# already reads process.env.PORT with a fallback to 3000.
EXPOSE 8080

WORKDIR /app/api
# Use `;` instead of `&&` so the server starts even if migrations fail —
# the failure will be visible in logs but won't prevent /health from
# responding (Railway will SIGKILL the container if /health doesn't
# respond inside the healthcheck window). Diagnostic echos let us see
# exactly which phase the container is in.
CMD ["sh", "-c", "echo '>>> phase=migrate-start'; node dist/db/migrate.js; echo \">>> phase=migrate-done exit=$?\"; echo '>>> phase=server-start'; exec node dist/index.js"]
