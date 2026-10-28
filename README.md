# SmileSync

Store-and-forward teledentistry triage for rural Kenya. Community health workers
(CHWs) capture oral images and symptoms on a phone with no internet needed. Cases
sync to a server when a connection returns. Remote dentists triage them on a web
dashboard, and the result flows back to the CHW's app.

Requirements are in [docs/SmileSync_SRS.md](docs/SmileSync_SRS.md), with UML diagrams in
[docs/diagrams/](docs/diagrams/). The mapping from each requirement to code and tests
is in [docs/TRACEABILITY.md](docs/TRACEABILITY.md).

## Repository layout

```
packages/shared   Types, Zod schemas, access rules, offline sync engine (plain TypeScript)
apps/api          REST API: Express + Prisma + PostgreSQL
apps/mobile       CHW app: React Native + Expo (Sprint 1)
apps/web          Dentist and admin dashboard: React + Vite (Sprint 3)
infra/            Caddy (TLS 1.3) and PostgreSQL init scripts
docs/             SRS, diagrams, traceability
```

## Prerequisites

- Node.js 24
- Docker Desktop, for PostgreSQL and the local stack

## First-time setup

```sh
npm install
cp .env.example .env     # fill in every value; the file explains how to generate secrets
```

## Run the local stack (PostgreSQL, API, Caddy)

```sh
docker compose up -d --build
docker compose run --rm migrate npm run db:seed   # synthetic demo users and cases
curl -k https://localhost/api/health              # {"status":"ok"}
```

`-k` is needed because Caddy uses its own local certificate authority for
`localhost`. Seeded logins are listed at the top of `apps/api/prisma/seed.ts`.

## Run the tests

The API tests need a real PostgreSQL database whose name ends in `_test`. The
Docker database creates one called `smilesync_test` the first time it starts.

```sh
docker compose up -d db
export TEST_DATABASE_URL=postgresql://smilesync:<POSTGRES_PASSWORD>@localhost:5432/smilesync_test
npm run typecheck
npm test
```

Shared-package tests alone need no database:

```sh
npm test -w @smilesync/shared
```

## Run the API outside Docker

```sh
docker compose up -d db
set -a; source .env; set +a
npm run db:migrate
npm run db:seed
npm run dev:api        # http://localhost:3000
```

## Rules for contributors

- Synthetic data only. Never use real patient data.
- No secrets in the repo. Use `.env`, which is ignored by git.
- Cite requirement IDs (for example FR 5.2) in code comments, tests and commit messages.
- New tables need explicit grants for the `smilesync_app` role in their migration.
