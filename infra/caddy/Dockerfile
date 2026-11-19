# Caddy with the built dashboard. Build from the repository root:
#   docker build -f infra/caddy/Dockerfile .

FROM node:24.22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
# The lockfile covers every workspace, so npm needs every manifest,
# but only the shared package and the dashboard are installed.
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @smilesync/shared --workspace @smilesync/web --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @smilesync/web

FROM caddy:2.11.6-alpine
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web /app/apps/web/dist /srv/web
