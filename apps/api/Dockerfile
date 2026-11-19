# SmileSync API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile .

# ---- build: all dependencies, compile TypeScript ----
FROM node:24.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# The lockfile covers every workspace, so npm needs the mobile manifest too,
# but only the API and shared packages are installed (no Expo in the server image).
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @smilesync/shared --workspace @smilesync/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @smilesync/api

# ---- tools: used by the one-off "migrate" service (prisma CLI + tsx for the seed) ----
FROM build AS tools
WORKDIR /app/apps/api
# Same non-root user as the API, so seeded image files are readable by it.
RUN mkdir -p storage && chown node:node storage
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- prod-deps: drop dev dependencies ----
FROM build AS prod-deps
RUN npm prune --omit=dev --workspace @smilesync/shared --workspace @smilesync/api --include-workspace-root

# ---- runtime: compiled code and production dependencies only, non-root ----
FROM node:24.22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
# NFR 1: encrypted image files; docker-compose mounts a volume here.
RUN mkdir -p /app/apps/api/storage && chown node:node /app/apps/api/storage
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/src/server.js"]
