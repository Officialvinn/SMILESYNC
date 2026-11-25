# Traceability: SRS requirements to code and tests

Status key: **Done** = implemented and tested. **Partial** = some parts done, the rest is
planned for the sprint shown. **Planned** = not started. Paths are relative to the repo root.

Last updated: Deployment (2026-11-25).

## Functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| FR 1.1 | Login with username and password (PIN on mobile) | Done. Server login; mobile login online first, then offline against a bcrypt PIN hash in the Keychain/Keystore. The server's answer wins; 5 wrong offline PINs wipe the offline credential. Token refresh on sync in Sprint 2. Usernames are not case-sensitive (stored lowercase; login lowercases them, online and offline) | `apps/api/src/routes/auth.ts`, `apps/mobile/src/core/offlineAuth.ts`, `apps/mobile/src/screens/LoginScreen.tsx` | `apps/api/test/auth.test.ts`, `apps/mobile/src/core/offlineAuth.test.ts` |
| FR 1.2 | Role-based access (CHW, Dentist, Administrator) | Done (server and shared rules) | `packages/shared/src/access/permissions.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/planned.ts` | `packages/shared/src/access/permissions.test.ts`, `apps/api/test/access.test.ts` |
| FR 2.1 | Enter patient name, age, location | Done on the phone (name, age, county, optional sex). Name encrypted on the server (API) and on the phone (SQLCipher). Upload in Sprint 2 | `apps/mobile/src/core/registration.ts`, `apps/mobile/src/screens/PatientScreen.tsx`, `apps/api/src/security/fieldCrypto.ts` | `apps/mobile/src/core/registration.test.ts`, `schemas.test.ts` |
| FR 2.2 | Generate anonymised patient ID | Done. Generated on the phone at registration, with no network | `packages/shared/src/domain/anonId.ts`, `apps/mobile/src/core/registration.ts` | `anonId.test.ts`, `registration.test.ts` |
| FR 2.3 | Record consent before any capture | Done. Consent screen comes first; nothing is stored on refusal; the phone and server databases both reject a patient without consent. A draft can be deleted if consent is withdrawn | `apps/mobile/src/screens/ConsentScreen.tsx`, `apps/mobile/src/core/registration.ts`, `apps/mobile/src/core/localDb.ts`, migration `..._audit_and_constraints` | `registration.test.ts`, `caseRepo.test.ts`, `auditLog.test.ts` |
| FR 3.1 | Launch camera | Done. In-app camera with light toggle; run on the Android emulator and on a real Pixel 7 Pro (2026-11-19) | `apps/mobile/src/screens/CaptureScreen.tsx` | Manual, on a development build |
| FR 3.2 | Guidance for at least 3 standard views | Done. Written steps per view, a framing guide, preview and retake; the app goes through the 3 views in order and blocks Continue until all exist. Up to 3 extras | `apps/mobile/src/core/capturePlan.ts`, `apps/mobile/src/screens/CaptureScreen.tsx` | `capturePlan.test.ts`, `caseRepo.test.ts` |
| FR 3.3 | Compress each submission to under 2 MB | Done on the phone. On a real Pixel 7 Pro, three photos came to 100, 120 and 143 KB (363 KB per case) at the first, best-quality step. Each photo is re-encoded as JPEG down a size ladder until it fits an equal share (about 344 KB) of the 2 MB budget; the store refuses anything that would exceed it. Upload-side guard in the sync engine and DB | `apps/mobile/src/core/compression.ts`, `apps/mobile/src/platform/photos.ts`, `apps/mobile/src/core/caseRepo.ts`, `engine.ts` (`payloadBytes`) | `compression.test.ts`, `caseRepo.test.ts`, `engine.test.ts` |
| FR 4.1 | Pain 1-10 and duration | Done. Step 4 of the CHW flow: ten large pain buttons and four duration choices; validated on the phone, the server and by DB checks | `apps/mobile/src/screens/SymptomsScreen.tsx`, `apps/mobile/src/core/caseRepo.ts`, `schemas.ts` | `syncStore.test.ts`, `schemas.test.ts`, `auditLog.test.ts` |
| FR 4.2 | Save locally when offline | Done. Save case makes the draft Pending in the encrypted phone database and locks it; only complete cases (3 photos + questionnaire) can be saved | `apps/mobile/src/core/caseRepo.ts`, `apps/mobile/src/core/syncStore.ts`, `apps/mobile/src/core/localDb.ts` | `syncStore.test.ts`, `caseRepo.test.ts` |
| FR 5.1 | Automatic sync when connectivity returns | Done (code). NetInfo reconnect, app foreground, after saving, and Send now; backoff retries while online. Exercised end to end in tests and on the Android emulator (airplane mode, then automatic send on reconnect) | `apps/mobile/src/platform/sync.ts`, `apps/mobile/src/core/syncService.ts`, `packages/shared/src/sync/engine.ts` | `engine.test.ts`, `syncService.test.ts`, `apps/api/test/cases.test.ts` (end to end) |
| FR 5.2 | Retry without duplicates or loss | Done. Client UUIDs; POST /cases is idempotent (repeat = 200, changes nothing); photos go one per request with a SHA-256 and the server lists only the missing ones, so a retry skips photos it already has; the case is stored in one transaction only when all photos are present | `packages/shared/src/sync/httpTransport.ts`, `apps/api/src/routes/cases.ts`, `apps/api/src/storage/imageStore.ts` | `httpTransport.test.ts`, `apps/api/test/cases.test.ts` (lost response, connection lost mid-photos) |
| FR 5.3 | Status Pending / Synced / Reviewed | Done. Shown on the home list and case screen, with retry time and actionable errors; a reviewed case never moves back | `apps/mobile/src/core/syncStore.ts`, `apps/mobile/src/ui/labels.ts`, `apps/mobile/src/screens/` | `syncStore.test.ts`, `engine.test.ts` |
| FR 6.1 | Case queue for dentists | Done. Waiting (Synced) cases by default; anonymised ID, age, sex, county, pain, duration, received time, photos, priority; never the name | `apps/api/src/routes/dashboard.ts`, `apps/web/src/pages/QueuePage.tsx` | `apps/api/test/dashboard.test.ts`, `apps/web/e2e/dentist.spec.ts` |
| FR 6.2 | Expand and zoom images | Done. Photos decrypted per request (no-store), shown from blob URLs; full-screen viewer with zoom buttons, wheel, keyboard, drag to pan, next/previous | `apps/api/src/routes/dashboard.ts`, `apps/web/src/components/ImageViewer.tsx`, `apps/web/src/lib/zoom.ts` | `dashboard.test.ts`, `apps/web/src/lib/lib.test.ts`, `dentist.spec.ts` |
| FR 6.3 | Filter and sort by priority, date, location | Done. Filters: status, priority, county, received date range. Sort: **highest pain first, then oldest (default, see decisions)**, oldest, newest, priority | `apps/api/src/routes/dashboard.ts`, `packages/shared/src/domain/dashboard.ts`, `apps/web/src/pages/QueuePage.tsx` | `dashboard.test.ts`, `dentist.spec.ts` |
| FR 7.1 | Assign Routine / Urgent / Emergency | Done. Sets the case to Reviewed; a later review can change it | `apps/api/src/routes/dashboard.ts` (`PUT /cases/{id}/triage`), `apps/web/src/pages/CasePage.tsx` | `dashboard.test.ts`, `dentist.spec.ts` |
| FR 7.2 | Clinical notes and referral advice | Done. Notes with optional referral advice; the note id is generated in the browser so a retried save cannot add it twice | `apps/api/src/routes/dashboard.ts`, `apps/web/src/pages/CasePage.tsx` | `dashboard.test.ts`, `dentist.spec.ts` |
| FR 7.3 | Send triage result to the CHW's app | Done. **Chosen implementation: pull on sync.** The phone fetches results on every sync and every 15 minutes while results are outstanding; no push service. Verified end to end on the Android emulator and in Playwright | `apps/api/src/routes/cases.ts`, `httpTransport.ts`, `apps/mobile/src/screens/CaseScreen.tsx` | `cases.test.ts`, `dentist.spec.ts`, `syncStore.test.ts` |
| FR 8.1 | Create, deactivate, reset users | Done. Create (PIN rules for CHWs, password rules for others), deactivate/reactivate, reset (ends sessions, clears lockout), unlock; an admin cannot deactivate themselves. A fresh server gets its first admin from `prisma/createAdmin.ts` (one only, audited as `admin:bootstrap`; see docs/DEPLOY.md) | `apps/api/src/routes/admin.ts`, `apps/web/src/pages/UsersPage.tsx`, `apps/api/prisma/createAdmin.ts` | `apps/api/test/admin.test.ts`, `auth.test.ts` |
| FR 8.2 | Audit every access to patient data | Done. Every request to a guarded endpoint is logged (allowed, denied, not found), including logins, photo views and audit-log reads. Viewer with filters by user, action, outcome, resource and date | `apps/api/src/audit.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/admin.ts`, `apps/web/src/pages/AuditPage.tsx` | `access.test.ts`, `admin.test.ts`, `dashboard.test.ts`, `dentist.spec.ts` |

## Non-functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| NFR 1 | AES-256 at rest, TLS 1.3 in transit | Partial. Phone: SQLCipher (AES-256) with a random 256-bit key in the Keychain/Keystore; photos stored inside the encrypted database; the app refuses to store anything if SQLCipher is not active; temporary camera files deleted after use and at startup. Checked against the exact SQLCipher 4.7.0 source expo-sqlite bundles: no plaintext in the file, unreadable without the key. Server: patient names AES-256-GCM; oral images AES-256-GCM files bound to their image id, readable only by the API user; TLS 1.3 only via Caddy (verified); the app accepts only https. Server disk: host disk encryption required. Hardening: failed logins limited per network address; phone asks for the PIN again after 5 minutes away; see docs/SECURITY_REVIEW.md. Release app: signed with the SmileSync upload key, never the debug key, and built without the local development certificate (docs/DEPLOY.md) | `apps/mobile/plugins/withReleaseSigning.js`, `apps/mobile/build-release.sh`, `apps/mobile/src/core/localDb.ts`, `apps/mobile/src/core/serialDb.ts`, `apps/mobile/src/platform/`, `apps/api/src/security/fieldCrypto.ts`, `infra/caddy/Caddyfile` | `localDb.test.ts`, `serialDb.test.ts`, `unit.test.ts` |
| NFR 2 | Queue loads in under 3 s | Done. Measured in Chromium with an empty cache on emulated 10 Mbit/s broadband (40 ms): 341-1,094 ms to the first case row. Rural 3G (1.6 Mbit/s, 300 ms), for information: about 1.5 s. Server: 500-case queue page well under 1 s | `apps/api/src/routes/dashboard.ts`, `schema.prisma` (indexes) | `apps/web/e2e/performance.spec.ts`, `dashboard.test.ts` |
| NFR 3 | CHW submission in under 5 min | Partial. Four-step flow with a progress bar, one clear action per screen, 56 dp targets, contrast tested to WCAG AA. The 5-minute target needs timing with real CHWs (field-test checklist) | `apps/mobile/src/screens/`, `apps/mobile/src/ui/` | `contrast.test.ts`, `docs/FIELD_TEST.md` |
| NFR 4 | Audit log kept 12+ months, not editable | Done. Trigger blocks UPDATE, DELETE and TRUNCATE for everyone; runtime role has insert and select only; nothing deletes rows | migration `..._audit_and_constraints`, `infra/postgres/init/01-roles.sh` | `auditLog.test.ts` |
| NFR 5 | Android 9+, iOS 14+, Chrome/Edge/Safari | Partial. Android: verified on a Pixel 7 Pro and the emulator (minimum API 24). Dashboard: Playwright happy path passes in Chromium (Chrome, Edge) and WebKit (Safari). **iOS: not built; Expo SDK 57 needs iOS 16.4+ (open question 7)** | `apps/mobile/app.json`, `apps/web/playwright.config.ts` | `dentist.spec.ts` (chromium, webkit) |
| NFR 6 | Kenya Data Protection Act 2019 | Partial. Consent first and recorded with time; names hidden from dentists and admins; EXIF (including GPS) not requested and dropped by re-encoding; location, microphone and storage permissions blocked; Android backup off; drafts deletable on withdrawn consent; synthetic data only. Uploaded photos of cases that never arrive are deleted after 7 days. Server-side erasure still has no path | `permissions.ts`, `apps/mobile/src/core/`, `apps/mobile/app.json` | `permissions.test.ts`, `caseRepo.test.ts` |
| NFR 7 | 99.5% monthly uptime | Partial for the local demo: services restart automatically and have health checks; backup, verify and restore scripts (verify proved a full restore). Deployed 2026-11-24 on one AWS EC2 instance (see Deployment below); one instance cannot guarantee 99.5%, and uptime is not yet monitored | `docker-compose.yml`, `scripts/` | `scripts/verify-backup.sh` |

## Differences from the class diagram (B.2)

| Diagram | Implementation | Why |
|---|---|---|
| User with three subclasses | One `users` table with role-specific nullable columns | Simplest mapping in Prisma |
| `Patient.patientId {anonymized}` | `anonId` (shown to dentists) plus an internal client-generated UUID `id` | The UUID is the idempotency key for sync (FR 5.2) |
| `Patient.name` | `nameEncrypted` | NFR 1 |
| No sex field | Optional `sex` | Your decision to show sex on the dashboard. Not in FR 2.1, so awaiting confirmation |
| `location: String` | One of Kenya's 47 counties | Makes FR 6.3 location filtering reliable |
| `OralImage.viewType: String` | Enum: front, upper arch, lower arch, extra | FR 3.2 |
| (none) | `OralImage.sha256` | Integrity check on upload |
| `SymptomAssessment.duration: String` | Enum of 4 duration buckets | Faster to tap (NFR 3), comparable across cases |
| Associations only | Foreign keys `patientId`, `submittedById`, `reviewedById`, plus `reviewedAt` | Implied by the diagram's associations |
| `SyncQueue` class | Not a server table. Lives on the phone as the sync engine plus retry fields on each local case | The server never holds Pending cases |
| `AuditLog` | Adds `outcome`, `resourceType`, `ipAddress`; `userId` may be null for unknown-username logins | FR 8.2 asks to record every access, including denied ones |
| `User` | Adds lockout fields, `tokenVersion` and timestamps | Lockout protects short PINs; `tokenVersion` revokes tokens on deactivation or reset |
| `CaseStatus` includes PENDING | Kept in the enum; a DB check forbids it on the server | Matches the diagram and your status decision |

## Differences from the sequence diagram (B.3)

| Diagram | Implementation | Status |
|---|---|---|
| `POST /cases` with case, images and assessment | `POST /cases` carries the case JSON (patient, image metadata with SHA-256, assessment). Photos go as `PUT /cases/{id}/images/{imageId}`, raw bytes, one per request; the server answers 409 with the photos it still needs. Repeats return 200 | Done (Sprint 2). Chosen so a weak connection never re-sends a photo the server has (your FR 5.2 decision) and a dentist never sees a half-uploaded case |
| `GET /cases?sort=priority` for the queue | `sort=priority` exists, but the default is highest pain first, then oldest, because waiting cases have no priority yet | Done (Sprint 3). Default chosen pending your answer to open question 2 |
| `PUT /cases/{id}/triage` | Same. Sets priority and adds a note with a client-generated ID, so a retry does not add it twice | Done (Sprint 3) |
| `GET /cases/{id}/triage` per case | Same, one request per waiting case. A batch endpoint can be added without engine changes | Done (Sprint 2). Batch still an **open question** |
| Not shown | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, image download, admin users, audit log | Added |

## Open questions

None of these has been answered yet; the build follows the default shown in each.


1. **Sex field.** FR 2.1 lists name, age and location only. Should sex be collected?
2. **Queue sort.** Synced cases have no priority, so `sort=priority` cannot order the queue. **Sprint 3 default: highest pain first, then oldest** (oldest first is one click away). Confirm or overrule.
3. **Batch result fetch.** One `GET /cases/{id}/triage` per waiting case is slow on a weak connection. Can a batch endpoint be added next to the diagram's endpoint?
4. **Consent order.** Both diagrams collect name, age and location before consent, but FR 2.3 says consent comes before any data is captured. **Sprint 1 implements consent first**, following FR 2.3. Confirm or overrule.
5. **Revealing names to dentists.** Dentists never see names. Is a deliberate, audited "show name" action needed? **Sprint 3 built none.**
6. **Erasure requests.** The Data Protection Act gives patients a right to erasure, but nothing deletes data now. A controlled admin process would be needed.
7. **iOS minimum.** Expo SDK 57 needs iOS 16.4+, but the SRS says iOS 14+. Accept iOS 16.4+, or use an older SDK?

## Mobile decisions made in Sprint 1

| Decision | Why |
|---|---|
| Consent screen before the details form | FR 2.3 wins over the diagrams' order (open question 4) |
| Photos stored as BLOBs inside the SQLCipher database, not as files | One AES-256 key covers everything; no second encryption scheme |
| One database connection, transactions queued in JavaScript | expo-sqlite's exclusive transactions open a second connection without the key or foreign keys |
| Up to 3 extra photos (6 in total), each held to an equal share of the 2 MB budget | A later photo can never force a retake of an earlier one |
| One CHW per phone for offline login; each CHW sees only their own cases | Simplest safe rule; shared phones would need per-user keys |
| Each registration creates a new patient record | Returning-patient lookup is not in the SRS |
| Drafts (still capturing) are separate from Pending (submitted) | Pending means "complete and ready to send"; Save case on the symptoms step makes it Pending |
| Photos uploaded as raw bytes, not multipart or base64 | No upload library; React Native sends a Uint8Array body as binary; base64 would add a third to every upload |
| Login token refreshed before a sync when it has under 3 days left | FR 1.1 "token refreshes on sync" without an extra request on every run |
| Uploaded photos for a case that never arrives stay in the server's incoming folder | Clean-up job planned for hardening (data minimisation) |
| No navigation library | The CHW flow is linear; a small state machine is enough |

**Platform note (NFR 5).** Expo SDK 57 sets the iOS minimum to 16.4 (read from the
generated Xcode project). The SRS asks for iOS 14+. iPhones that stop at iOS 15
(iPhone 6s, 7, SE 1st generation) cannot install the app. Android is fine: the minimum
is API 24 (Android 7.0), below the SRS's Android 9. Options: accept iOS 16.4+ (most
CHWs in Kenya are likely to carry Android), or move to an older Expo SDK, which stops
getting security fixes sooner. **Open question 7.**

## Dashboard decisions made in Sprint 3

| Decision | Why |
|---|---|
| Queue default: Synced cases, highest pain first, then oldest | Waiting cases have no priority yet (open question 2) |
| No name anywhere in dentist API responses | Your decision; tests check that the name never appears |
| Photos served decrypted per request with `Cache-Control: no-store`, shown from blob URLs that are revoked | No decrypted photo is cached by the browser or a proxy |
| Session token in `sessionStorage`, 8-hour expiry | Ends when the tab closes; never shared with other tabs |
| Strict Content-Security-Policy from Caddy (`'self'` only, `blob:` images) | Limits damage from any injected script |
| Hash-based routes, no router library | Reload-safe with a plain static file server; fewer dependencies |
| Seed photos are drawn PNGs made with `node:zlib` | Synthetic data only; no image library |
| CI runs the whole docker stack and the Playwright happy path with throwaway secrets | The MVP flow is tested on every push |

## Hardening (after Sprint 3)

| Item | Where |
|---|---|
| Security review: what was checked, evidence, open risks | `docs/SECURITY_REVIEW.md` |
| Field-test checklist, with a requirement per task | `docs/FIELD_TEST.md` |
| User guide for CHWs, dentists and administrators | `docs/USER_GUIDE.md` |
| Failed-login limit per address (FR 1.1) | `apps/api/src/http/rateLimit.ts`, `hardening.test.ts` |
| Abandoned uploads deleted after 7 days (NFR 6) | `apps/api/src/storage/imageStore.ts`, `apps/api/src/server.ts`, `hardening.test.ts` |
| Phone locks after 5 minutes in the background | `apps/mobile/src/core/appLock.ts`, `appLock.test.ts` |
| Automated accessibility: axe WCAG 2.1 AA on every dashboard page; phone contrast | `apps/web/e2e/accessibility.spec.ts`, `contrast.test.ts` |
| Backups | `scripts/backup.sh`, `scripts/verify-backup.sh`, `scripts/restore.sh` |

## Deployment (2026-11-24 to 2026-11-25)

| Item | Where |
|---|---|
| Live dashboard and API: https://smilesync.alvinn.tech (AWS EC2, Ubuntu 24.04, docker compose; Let's Encrypt certificate; TLS 1.3 only, TLS 1.2 refused; HSTS and CSP headers; HTTP redirects to HTTPS; database and API ports closed to the internet) (NFR 1) | `docker-compose.yml`, `infra/caddy/Caddyfile`, `docs/DEPLOY.md` |
| First administrator on an empty server (FR 8.1) | `apps/api/prisma/createAdmin.ts` |
| Signed Android release, Android 7.0+ (API 24), trusts only system certificate authorities (NFR 1, NFR 5) | `apps/mobile/build-release.sh`, `apps/mobile/plugins/withReleaseSigning.js`, `apps/mobile/plugins/withNetworkSecurity.js` |
| APK download: https://smilesync.alvinn.tech/download/smilesync.apk | `infra/caddy/Caddyfile` (`/download/*`), `apps/mobile/CHANGELOG.md` |
| Clearer form errors on the Users page: which field is wrong and why (FR 8.1) | `apps/web/src/api.ts`, `apps/web/src/lib/describeError.test.ts` |
| Case-insensitive usernames (FR 1.1) | `packages/shared/src/domain/schemas.ts`, `apps/mobile/src/core/offlineAuth.ts`, `apps/api/test/auth.test.ts`, `offlineAuth.test.ts` |

Data protection (NFR 6): the server is in the US (us-east-1), because AWS has no
region in Kenya. Health data leaving Kenya needs safeguards under the Data
Protection Act 2019; get the institution's or the ODPC's position before any
real patient data. Until then the server holds synthetic data only.
