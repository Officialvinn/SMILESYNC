# SmileSync

Store-and-forward teledentistry triage for rural Kenya. Community health workers
(CHWs) capture oral images and symptoms on a phone with no internet needed. Cases
sync to a server when a connection returns. Remote dentists triage them on a web
dashboard, and the result flows back to the CHW's app.

Requirements are in [docs/SmileSync_SRS.md](docs/SmileSync_SRS.md), with UML diagrams in
[docs/diagrams/](docs/diagrams/). The mapping from each requirement to code and tests
is in [docs/TRACEABILITY.md](docs/TRACEABILITY.md).

## Try it now (live deployment)

| What | Link |
|---|---|
| Dentist and admin dashboard | <https://smilesync.alvinn.tech> |
| CHW Android app (APK, about 60 MB) | <https://smilesync.alvinn.tech/download/smilesync.apk> |
| Requirements (SRS) | [docs/SmileSync_SRS.md](docs/SmileSync_SRS.md) |
| System design (UML) | [docs/diagrams/](docs/diagrams/) |

The live server holds **synthetic data only**. Demo logins for each role (CHW,
dentist, administrator) are given with the submission, not in this public repo.

### Install the CHW app on an Android phone

Works on Android 7.0 or newer. Not available for iPhone.

1. On the phone, open <https://smilesync.alvinn.tech/download/smilesync.apk> in Chrome.
2. When the download finishes, tap the file (or open it from **Downloads**).
3. If Android says the source is not allowed, tap **Settings**, turn on
   **Allow from this source** for Chrome, then go back.
4. Tap **Install**, then **Open**.
5. Log in with a CHW username and PIN. The **first** login needs internet; after
   that the app works offline (airplane mode) and sends cases when the phone
   reconnects.

If Play Protect warns that the app is unknown, tap **More details**, then
**Install anyway**. The app is signed by the project, not published on Google Play.

### Walk through the main flow

1. **CHW (phone):** log in, register a patient, record consent, take the three
   photos (front, upper arch, lower arch), answer the symptom questions, save.
   Works in airplane mode; the case is *Pending* until it is sent.
2. Turn the internet back on: the case sends by itself and becomes *Synced*.
3. **Dentist (dashboard):** log in, open the case from the queue, zoom the
   photos, set a priority, write notes and optional referral advice, save.
4. **CHW (phone):** on the next sync (open the app, or tap **Send now**) the
   case shows *Reviewed* with the dentist's priority and advice.
5. **Administrator (dashboard):** manage users under **Users**, and see every
   access to patient data under **Audit log**.

## Repository layout

```
packages/shared   Types, Zod schemas, access rules, offline sync engine (plain TypeScript)
apps/api          REST API: Express + Prisma + PostgreSQL
apps/mobile       CHW app: React Native + Expo SDK 57 development build
apps/web          Dentist and admin dashboard: React + Vite, served by Caddy
infra/            Caddy (TLS 1.3) and PostgreSQL init scripts
docs/             SRS, diagrams, traceability
```

## Run it on your own computer

### Prerequisites

- Git
- Node.js 24 (from <https://nodejs.org>; check with `node -v`)
- Docker Desktop (from <https://www.docker.com/products/docker-desktop/>), started
  before the steps below. It runs PostgreSQL, the API, the dashboard and Caddy.
- Only to build the mobile app yourself: Android Studio and JDK 17. See
  [apps/mobile/README.md](apps/mobile/README.md). To just try the app, use the
  APK above instead.

To put it on your own server and domain, follow [docs/DEPLOY.md](docs/DEPLOY.md).

### First-time setup

```sh
git clone https://github.com/Officialvinn/SMILESYNC.git
cd SMILESYNC
npm install
cp .env.example .env     # then fill in every value; the file explains how to generate each secret
```

## Run the local stack (PostgreSQL, API, dashboard, Caddy)

```sh
docker compose up -d --build
docker compose run --rm migrate npm run db:seed   # synthetic demo users and cases
curl -k https://localhost/api/health              # {"status":"ok"}
```

`-k` is needed because Caddy uses its own local certificate authority for
`localhost`. Seeded logins are listed at the top of `apps/api/prisma/seed.ts`.

Open the dashboard at <https://localhost/> (your browser will warn about the local
certificate). Log in as `dentist1` for the case queue, or `admin1` for users and
the audit log, with `SEED_PASSWORD` from your `.env`.

Dashboard development with hot reload (the stack must be running for the API):

```sh
npm run dev:web        # http://localhost:5173, /api proxied to the stack
```

End-to-end test of the dentist's path against the running stack:

```sh
set -a; . ./.env; set +a
npx --workspace @smilesync/web playwright install chromium   # once
npm run e2e
```

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

## Run the mobile app

See [apps/mobile/README.md](apps/mobile/README.md). Its core logic is tested with
`npm test` like the rest of the repo, with no phone needed.

## Back up and restore

```sh
scripts/backup.sh                              # database + encrypted photos, to backups/<time>
scripts/verify-backup.sh backups/<time>        # proves it restores, without touching live data
scripts/restore.sh backups/<time> --yes-replace-live-data
```

## Documents

- `docs/USER_GUIDE.md`: for CHWs, dentists and administrators
- `docs/FIELD_TEST.md`: checklist for a pilot
- `docs/SECURITY_REVIEW.md`: what was checked and the open risks
- `docs/TRACEABILITY.md`: every requirement mapped to code and tests

## Rules for contributors

- Synthetic data only. Never use real patient data.
- No secrets in the repo. Use `.env`, which is ignored by git.
- Cite requirement IDs (for example FR 5.2) in code comments, tests and commit messages.
- New tables need explicit grants for the `smilesync_app` role in their migration.
