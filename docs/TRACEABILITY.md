# Traceability: SRS requirements to code and tests

Status key: **Done** = implemented and tested. **Partial** = some parts done, the rest is
planned for the sprint shown. **Planned** = not started. Paths are relative to the repo root.

Last updated: Sprint 2 (2026-11-19).

## Functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| FR 1.1 | Login with username and password (PIN on mobile) | Done. Server login; mobile login online first, then offline against a bcrypt PIN hash in the Keychain/Keystore. The server's answer wins; 5 wrong offline PINs wipe the offline credential. Token refresh on sync in Sprint 2 | `apps/api/src/routes/auth.ts`, `apps/mobile/src/core/offlineAuth.ts`, `apps/mobile/src/screens/LoginScreen.tsx` | `apps/api/test/auth.test.ts`, `apps/mobile/src/core/offlineAuth.test.ts` |
| FR 1.2 | Role-based access (CHW, Dentist, Administrator) | Done (server and shared rules) | `packages/shared/src/access/permissions.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/planned.ts` | `packages/shared/src/access/permissions.test.ts`, `apps/api/test/access.test.ts` |
| FR 2.1 | Enter patient name, age, location | Done on the phone (name, age, county, optional sex). Name encrypted on the server (API) and on the phone (SQLCipher). Upload in Sprint 2 | `apps/mobile/src/core/registration.ts`, `apps/mobile/src/screens/PatientScreen.tsx`, `apps/api/src/security/fieldCrypto.ts` | `apps/mobile/src/core/registration.test.ts`, `schemas.test.ts` |
| FR 2.2 | Generate anonymised patient ID | Done. Generated on the phone at registration, with no network | `packages/shared/src/domain/anonId.ts`, `apps/mobile/src/core/registration.ts` | `anonId.test.ts`, `registration.test.ts` |
| FR 2.3 | Record consent before any capture | Done. Consent screen comes first; nothing is stored on refusal; the phone and server databases both reject a patient without consent. A draft can be deleted if consent is withdrawn | `apps/mobile/src/screens/ConsentScreen.tsx`, `apps/mobile/src/core/registration.ts`, `apps/mobile/src/core/localDb.ts`, migration `..._audit_and_constraints` | `registration.test.ts`, `caseRepo.test.ts`, `auditLog.test.ts` |
| FR 3.1 | Launch camera | Done (code). In-app camera with light toggle; not yet run on a device | `apps/mobile/src/screens/CaptureScreen.tsx` | Manual, on a development build |
| FR 3.2 | Guidance for at least 3 standard views | Done. Written steps per view, a framing guide, preview and retake; the app goes through the 3 views in order and blocks Continue until all exist. Up to 3 extras | `apps/mobile/src/core/capturePlan.ts`, `apps/mobile/src/screens/CaptureScreen.tsx` | `capturePlan.test.ts`, `caseRepo.test.ts` |
| FR 3.3 | Compress each submission to under 2 MB | Done on the phone. Each photo is re-encoded as JPEG down a size ladder until it fits an equal share (about 344 KB) of the 2 MB budget; the store refuses anything that would exceed it. Upload-side guard in the sync engine and DB | `apps/mobile/src/core/compression.ts`, `apps/mobile/src/platform/photos.ts`, `apps/mobile/src/core/caseRepo.ts`, `engine.ts` (`payloadBytes`) | `compression.test.ts`, `caseRepo.test.ts`, `engine.test.ts` |
| FR 4.1 | Pain 1-10 and duration | Done. Step 4 of the CHW flow: ten large pain buttons and four duration choices; validated on the phone, the server and by DB checks | `apps/mobile/src/screens/SymptomsScreen.tsx`, `apps/mobile/src/core/caseRepo.ts`, `schemas.ts` | `syncStore.test.ts`, `schemas.test.ts`, `auditLog.test.ts` |
| FR 4.2 | Save locally when offline | Done. Save case makes the draft Pending in the encrypted phone database and locks it; only complete cases (3 photos + questionnaire) can be saved | `apps/mobile/src/core/caseRepo.ts`, `apps/mobile/src/core/syncStore.ts`, `apps/mobile/src/core/localDb.ts` | `syncStore.test.ts`, `caseRepo.test.ts` |
| FR 5.1 | Automatic sync when connectivity returns | Done (code). NetInfo reconnect, app foreground, after saving, and Send now; backoff retries while online. Exercised end to end in tests; on-device run pending | `apps/mobile/src/platform/sync.ts`, `apps/mobile/src/core/syncService.ts`, `packages/shared/src/sync/engine.ts` | `engine.test.ts`, `syncService.test.ts`, `apps/api/test/cases.test.ts` (end to end) |
| FR 5.2 | Retry without duplicates or loss | Done. Client UUIDs; POST /cases is idempotent (repeat = 200, changes nothing); photos go one per request with a SHA-256 and the server lists only the missing ones, so a retry skips photos it already has; the case is stored in one transaction only when all photos are present | `packages/shared/src/sync/httpTransport.ts`, `apps/api/src/routes/cases.ts`, `apps/api/src/storage/imageStore.ts` | `httpTransport.test.ts`, `apps/api/test/cases.test.ts` (lost response, connection lost mid-photos) |
| FR 5.3 | Status Pending / Synced / Reviewed | Done. Shown on the home list and case screen, with retry time and actionable errors; a reviewed case never moves back | `apps/mobile/src/core/syncStore.ts`, `apps/mobile/src/ui/labels.ts`, `apps/mobile/src/screens/` | `syncStore.test.ts`, `engine.test.ts` |
| FR 6.1 | Case queue for dentists | Planned (Sprint 3). Route guarded and audited now | `apps/api/src/routes/planned.ts` | `access.test.ts` |
| FR 6.2 | Expand and zoom images | Planned (Sprint 3) | | |
| FR 6.3 | Filter and sort by priority, date, location | Planned (Sprint 3). Indexes in place | `schema.prisma` (`@@index`) | |
| FR 7.1 | Assign Routine / Urgent / Emergency | Partial. Schema, enum and DB rule done; endpoint in Sprint 3 | `schemas.ts`, `schema.prisma` | `schemas.test.ts`, `auditLog.test.ts` |
| FR 7.2 | Clinical notes and referral advice | Planned (Sprint 3). Schema done | `schema.prisma` (`ClinicalNote`) | |
| FR 7.3 | Send triage result to the CHW's app | Partial. **Chosen implementation: pull on sync.** GET /cases/{id}/triage (submitting CHW only) and the phone's pull, display of priority, notes and referral advice are done. Dentists can set results in Sprint 3 | `apps/api/src/routes/cases.ts`, `httpTransport.ts`, `apps/mobile/src/screens/CaseScreen.tsx` | `apps/api/test/cases.test.ts`, `httpTransport.test.ts`, `syncStore.test.ts` |
| FR 8.1 | Create, deactivate, reset users | Partial. Deactivation and token revocation enforced; admin endpoints in Sprint 3 | `apps/api/src/http/auth.ts` (`isActive`, `tokenVersion`) | `auth.test.ts`, `permissions.test.ts` |
| FR 8.2 | Audit every access to patient data | Done for all current endpoints, including denied attempts and logins. Viewer in Sprint 3 | `apps/api/src/audit.ts`, `apps/api/src/http/auth.ts` | `access.test.ts`, `auth.test.ts`, `auditLog.test.ts` |

## Non-functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| NFR 1 | AES-256 at rest, TLS 1.3 in transit | Partial. Phone: SQLCipher (AES-256) with a random 256-bit key in the Keychain/Keystore; photos stored inside the encrypted database; the app refuses to store anything if SQLCipher is not active; temporary camera files deleted after use and at startup. Checked against the exact SQLCipher 4.7.0 source expo-sqlite bundles: no plaintext in the file, unreadable without the key. Server: patient names AES-256-GCM; oral images AES-256-GCM files bound to their image id, readable only by the API user; TLS 1.3 only via Caddy (verified); the app accepts only https. Server disk: host disk encryption required | `apps/mobile/src/core/localDb.ts`, `apps/mobile/src/core/serialDb.ts`, `apps/mobile/src/platform/`, `apps/api/src/security/fieldCrypto.ts`, `infra/caddy/Caddyfile` | `localDb.test.ts`, `serialDb.test.ts`, `unit.test.ts` |
| NFR 2 | Queue loads in under 3 s | Planned (Sprint 3 and hardening). Queue indexes in place | `schema.prisma` | |
| NFR 3 | CHW submission in under 5 min | Partial. Step counter, 60 dp touch targets, large text, camera opens straight to the next missing view, last county remembered. Timed field test after Sprint 2 | `apps/mobile/src/ui/`, `apps/mobile/src/screens/` | Field test |
| NFR 4 | Audit log kept 12+ months, not editable | Done. Trigger blocks UPDATE, DELETE and TRUNCATE for everyone; runtime role has insert and select only; nothing deletes rows | migration `..._audit_and_constraints`, `infra/postgres/init/01-roles.sh` | `auditLog.test.ts` |
| NFR 5 | Android 9+, iOS 14+, Chrome/Edge/Safari | Partial. Android: minimum API 24 (Android 7), so Android 9+ is covered. **iOS: Expo SDK 57 requires iOS 16.4+, short of the SRS's iOS 14+** (see note below). Dashboard in Sprint 3 | `apps/mobile/app.json` | |
| NFR 6 | Kenya Data Protection Act 2019 | Partial. Consent first and recorded with time; names hidden from dentists and admins; EXIF (including GPS) not requested and dropped by re-encoding; location, microphone and storage permissions blocked; Android backup off; drafts deletable on withdrawn consent; synthetic data only. Server-side erasure still has no path | `permissions.ts`, `apps/mobile/src/core/`, `apps/mobile/app.json` | `permissions.test.ts`, `caseRepo.test.ts` |
| NFR 7 | 99.5% monthly uptime | Not applicable to the local demo. Revisit when deployed to a VM | | |

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
| `GET /cases?sort=priority` for the queue | The queue holds Synced cases, which have no priority yet | **Open question** |
| `PUT /cases/{id}/triage` | Same. Sets priority and adds a note with a client-generated ID, so a retry does not add it twice | Sprint 3 |
| `GET /cases/{id}/triage` per case | Same, one request per waiting case. A batch endpoint can be added without engine changes | Done (Sprint 2). Batch still an **open question** |
| Not shown | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, image download, admin users, audit log | Added |

## Open questions

1. **Sex field.** FR 2.1 lists name, age and location only. Should sex be collected?
2. **Queue sort.** Synced cases have no priority, so `sort=priority` cannot order the queue. Should the default order be oldest first, or highest pain level first?
3. **Batch result fetch.** One `GET /cases/{id}/triage` per waiting case is slow on a weak connection. Can a batch endpoint be added next to the diagram's endpoint?
4. **Consent order.** Both diagrams collect name, age and location before consent, but FR 2.3 says consent comes before any data is captured. **Sprint 1 implements consent first**, following FR 2.3. Confirm or overrule.
5. **Revealing names to dentists.** Dentists never see names. Is a deliberate, audited "show name" action needed?
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
