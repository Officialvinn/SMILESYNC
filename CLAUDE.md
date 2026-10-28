# SmileSync: project memory for Claude Code

Store-and-forward teledentistry for rural Kenya. CHWs capture oral images and
symptoms offline on a phone; dentists triage them on a web dashboard.

## Source of truth
- `docs/SmileSync_SRS.md`: requirements (FR 1-8, NFR 1-7). Cite IDs in code,
  tests and commits.
- `docs/diagrams/`: use case, class, sequence and activity diagrams.
  The class diagram defines the data model; the sequence diagram defines the API flow.
- If the SRS and diagrams disagree, tell me. Don't pick silently.

## Stack (approved)
- Monorepo: `apps/mobile`, `apps/api`, `apps/web`, `packages/shared`, `docs`
- Mobile: React Native + Expo (development build, not Expo Go), TypeScript,
  expo-sqlite with SQLCipher (key in expo-secure-store), expo-camera,
  expo-image-manipulator
- API: Node.js + Express + TypeScript, PostgreSQL, Prisma, Zod schemas shared
  from `packages/shared`
- Web: React + TypeScript + Vite
- Auth: JWT, roles CHW / Dentist / Administrator
- TLS 1.3 via a Caddy reverse proxy (config in the repo)
- Tests: Vitest/Jest, Playwright for the dashboard happy path
- Local dev: docker-compose (PostgreSQL, API, Caddy)

## Decisions already made
- Case status: Pending = saved on device, not uploaded. Synced = on the server,
  waiting for a dentist. Reviewed = dentist has triaged it. The dentist queue is
  the Synced cases. The server never holds a Pending case.
- Patient data: collect name, age and location (FR 2.1), encrypted. The dentist
  dashboard shows only the anonymised ID, age, sex and location by default, not
  the name. The CHW app shows the name so the CHW can find the patient.
- Images: at least 3 views: front (teeth together), upper arch, lower arch,
  plus optional extra photos. Each submission is compressed to under 2 MB.
- Sync: client-generated UUIDs and idempotent upserts. Image uploads carry a
  checksum so retries skip images the server already has (FR 5.2).
- CHW cannot edit a case after it syncs. The server's review always wins.
- Results reach the CHW by pull on each sync (satisfies FR 7.3 "send"; record
  this in `docs/TRACEABILITY.md`).
- Offline login: after the first online login, a CHW can log in offline with a
  PIN checked against a locally stored hash (FR 1.1). Token refreshes on sync.
- Audit log: append-only. A DB trigger rejects update/delete; the API's DB user
  has insert + select only. One middleware logs every request touching patient data.
- Hosting: run locally with docker-compose for the demo. Keep config portable.
  Ask before choosing any paid service.

## Hard constraints
AES-256 at rest (device DB and image files, and cloud), TLS 1.3 in transit,
under 2 MB per submission, consent before any capture, anonymised patient ID,
audit log retained 12+ months, Kenya Data Protection Act 2019 (consent, data
minimisation, access control), queue loads in under 3 s, a CHW can finish a
submission in under 5 min with large touch targets and a step-by-step flow.

## Working rules
1. Work one sprint at a time. At the end of each sprint run the tests and tell
   me what works, what is stubbed, and which FR/NFR IDs are done.
2. Write tests first for the sync engine and the access rules.
3. Small commits, e.g. "FR 5.2: idempotent sync retry".
4. Keep `docs/TRACEABILITY.md` mapping each FR/NFR to code and tests.
5. Never use real patient data. Synthetic seed data and synthetic images only.
   No secrets in the repo; use `.env.example`.
6. Ask before adding a paid service or a heavy dependency.

## Sprint plan (2-week sprints)
- Sprint 0: monorepo, docker-compose, CI, DB schema from the class diagram,
  seed data, auth and role-based access (FR 1).
- Sprint 1: mobile login, patient registration + consent + anonymised ID,
  camera capture with guidance, compression, encrypted local storage
  (FR 2, 3, 4.2).
- Sprint 2: symptom questionnaire, sync engine with retry and idempotency,
  sync status, API endpoints (FR 4, 5).
- Sprint 3: dashboard: queue, filter/sort, image zoom, priority, notes, notify
  CHW, admin users, audit log viewer (FR 6, 7, 8).
- Then hardening (security review, NFR checks, accessibility), a field-test
  checklist and a short user guide.

## Out of scope for v1.0
Video consultation, payments, e-prescribing, AI diagnosis, KHIS/DHIS2 integration.

## MVP is done when
A CHW registers a patient, records consent, captures 3 images and fills in the
questionnaire on a phone in airplane mode. When the phone reconnects, the case
syncs by itself. A dentist logs in on the dashboard, sees the case, zooms the
images, assigns a priority and adds notes. The CHW's app gets the result. An
admin can see the audit log.
