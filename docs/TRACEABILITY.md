# Traceability: SRS requirements to code and tests

Status key: **Done** = implemented and tested. **Partial** = some parts done, the rest is
planned for the sprint shown. **Planned** = not started. Paths are relative to the repo root.

Last updated: Sprint 0 (2026-10-28).

## Functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| FR 1.1 | Login with username and password (PIN on mobile) | Partial. Server done; mobile login and offline PIN in Sprint 1 | `apps/api/src/routes/auth.ts`, `apps/api/src/auth/` | `apps/api/test/auth.test.ts`, `apps/api/test/unit.test.ts` |
| FR 1.2 | Role-based access (CHW, Dentist, Administrator) | Done (server and shared rules) | `packages/shared/src/access/permissions.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/planned.ts` | `packages/shared/src/access/permissions.test.ts`, `apps/api/test/access.test.ts` |
| FR 2.1 | Enter patient name, age, location | Partial. Schema, validation and encryption done; form in Sprint 1 | `packages/shared/src/domain/schemas.ts`, `apps/api/prisma/schema.prisma`, `apps/api/src/security/fieldCrypto.ts` | `packages/shared/src/domain/schemas.test.ts` |
| FR 2.2 | Generate anonymised patient ID | Partial. Generator done; used by the app in Sprint 1 | `packages/shared/src/domain/anonId.ts` | `packages/shared/src/domain/anonId.test.ts` |
| FR 2.3 | Record consent before any capture | Partial. Schema and DB constraint done; consent screen in Sprint 1 | `packages/shared/src/domain/schemas.ts`, `apps/api/prisma/migrations/20261028000100_audit_and_constraints` | `schemas.test.ts`, `apps/api/test/auditLog.test.ts` |
| FR 3.1 | Launch camera | Planned (Sprint 1) | | |
| FR 3.2 | Guidance for at least 3 standard views | Partial. Required views enforced in validation; guidance UI in Sprint 1 | `packages/shared/src/domain/enums.ts` (`REQUIRED_VIEWS`) | `schemas.test.ts` |
| FR 3.3 | Compress each submission to under 2 MB | Partial. Size guard in sync engine and DB; compression in Sprint 1 | `packages/shared/src/sync/engine.ts` (`payloadBytes`) | `packages/shared/src/sync/engine.test.ts` |
| FR 4.1 | Pain 1-10 and duration | Partial. Schema and DB check done; form in Sprint 2 | `schemas.ts`, migration `..._audit_and_constraints` | `schemas.test.ts`, `auditLog.test.ts` |
| FR 4.2 | Save locally when offline | Partial. Engine contract and in-memory store done; SQLite store in Sprint 1-2 | `packages/shared/src/sync/types.ts`, `memoryStore.ts` | `engine.test.ts` |
| FR 5.1 | Automatic sync when connectivity returns | Partial. Engine and AutoSync done; NetInfo wiring in Sprint 2 | `packages/shared/src/sync/engine.ts` (`AutoSync`) | `engine.test.ts` |
| FR 5.2 | Retry without duplicates or loss | Partial. Client side done; server idempotent upsert in Sprint 2 | `packages/shared/src/sync/engine.ts` | `engine.test.ts` (lost response, crash, 200-round fault run) |
| FR 5.3 | Status Pending / Synced / Reviewed | Partial. Engine transitions and DB rule done; status UI in Sprint 2 | `engine.ts`, `memoryStore.ts`, migration `..._audit_and_constraints` | `engine.test.ts`, `auditLog.test.ts` |
| FR 6.1 | Case queue for dentists | Planned (Sprint 3). Route guarded and audited now | `apps/api/src/routes/planned.ts` | `access.test.ts` |
| FR 6.2 | Expand and zoom images | Planned (Sprint 3) | | |
| FR 6.3 | Filter and sort by priority, date, location | Planned (Sprint 3). Indexes in place | `schema.prisma` (`@@index`) | |
| FR 7.1 | Assign Routine / Urgent / Emergency | Partial. Schema, enum and DB rule done; endpoint in Sprint 3 | `schemas.ts`, `schema.prisma` | `schemas.test.ts`, `auditLog.test.ts` |
| FR 7.2 | Clinical notes and referral advice | Planned (Sprint 3). Schema done | `schema.prisma` (`ClinicalNote`) | |
| FR 7.3 | Send triage result to the CHW's app | Partial. **Chosen implementation: pull on sync.** The app fetches results each time it syncs and every 15 minutes while results are outstanding. No push service. Engine side done; endpoint in Sprint 2 | `engine.ts` (pull step, `AutoSync` poll) | `engine.test.ts` ("pulling triage results") |
| FR 8.1 | Create, deactivate, reset users | Partial. Deactivation and token revocation enforced; admin endpoints in Sprint 3 | `apps/api/src/http/auth.ts` (`isActive`, `tokenVersion`) | `auth.test.ts`, `permissions.test.ts` |
| FR 8.2 | Audit every access to patient data | Done for all current endpoints, including denied attempts and logins. Viewer in Sprint 3 | `apps/api/src/audit.ts`, `apps/api/src/http/auth.ts` | `access.test.ts`, `auth.test.ts`, `auditLog.test.ts` |

## Non-functional requirements

| ID | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| NFR 1 | AES-256 at rest, TLS 1.3 in transit | Partial. Patient names: AES-256-GCM in the API. TLS 1.3 only: Caddy config. Device DB (SQLCipher) and image files: Sprint 1. Server disk: PostgreSQL has no built-in encryption, so the host disk must be encrypted (FileVault locally, an encrypted volume on a VM) | `apps/api/src/security/fieldCrypto.ts`, `infra/caddy/Caddyfile` | `unit.test.ts` |
| NFR 2 | Queue loads in under 3 s | Planned (Sprint 3 and hardening). Queue indexes in place | `schema.prisma` | |
| NFR 3 | CHW submission in under 5 min | Planned (Sprint 1-2, field test). Duration buckets chosen for quick tapping | `enums.ts` | |
| NFR 4 | Audit log kept 12+ months, not editable | Done. Trigger blocks UPDATE, DELETE and TRUNCATE for everyone; runtime role has insert and select only; nothing deletes rows | migration `..._audit_and_constraints`, `infra/postgres/init/01-roles.sh` | `auditLog.test.ts` |
| NFR 5 | Android 9+, iOS 14+, Chrome/Edge/Safari | Planned (Sprint 1, Sprint 3) | | |
| NFR 6 | Kenya Data Protection Act 2019 | Partial. Consent enforced, names hidden from dentists and admins, least-privilege access, synthetic data only. Erasure requests have no path yet | `permissions.ts`, migrations | `permissions.test.ts` |
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
| `POST /cases` with case, images and assessment | Same: one multipart request including the patient record. Repeats return 200 instead of 201 | Route guarded now, handler in Sprint 2 |
| `GET /cases?sort=priority` for the queue | The queue holds Synced cases, which have no priority yet | **Open question** |
| `PUT /cases/{id}/triage` | Same. Sets priority and adds a note with a client-generated ID, so a retry does not add it twice | Sprint 3 |
| `GET /cases/{id}/triage` per case | Same. The engine already asks for all waiting cases at once, so a batch endpoint can be added without engine changes | **Open question** |
| Not shown | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, image download, admin users, audit log | Added |

## Open questions

1. **Sex field.** FR 2.1 lists name, age and location only. Should sex be collected?
2. **Queue sort.** Synced cases have no priority, so `sort=priority` cannot order the queue. Should the default order be oldest first, or highest pain level first?
3. **Batch result fetch.** One `GET /cases/{id}/triage` per waiting case is slow on a weak connection. Can a batch endpoint be added next to the diagram's endpoint?
4. **Consent order.** Both diagrams collect name, age and location before consent, but FR 2.3 says consent comes before any data is captured. Recommended: show the consent screen first.
5. **Revealing names to dentists.** Dentists never see names. Is a deliberate, audited "show name" action needed?
6. **Erasure requests.** The Data Protection Act gives patients a right to erasure, but nothing deletes data now. A controlled admin process would be needed.
