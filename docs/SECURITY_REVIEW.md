# SmileSync security review

Hardening phase, 19 November 2026. Covers the API, the CHW phone app, the dashboard
and the local docker-compose deployment. Requirement IDs refer to `docs/SmileSync_SRS.md`.

## Summary

The main protections are in place and tested: encryption at rest and in transit,
role-based access with ownership checks, an append-only audit log, and data
minimisation for dentists. The open risks are listed at the end. Most concern moving
from the local demo to a real deployment.

## What was checked

| Area | Status | Evidence |
|---|---|---|
| Encryption in transit (NFR 1) | TLS 1.3 only via Caddy; HSTS; the phone refuses non-https API addresses; release Android builds trust system certificate authorities only | `infra/caddy/Caddyfile`, `apps/mobile/src/platform/config.ts`, `apps/mobile/plugins/withNetworkSecurity.js` |
| Encryption on the phone (NFR 1) | SQLCipher (AES-256) with a random key in the Keychain/Keystore; photos stored inside the encrypted database; the app refuses to store data if SQLCipher is inactive; temporary camera files deleted. Checked on a Pixel 7 Pro: the database file has no readable content | `apps/mobile/src/core/localDb.ts`, `localDb.test.ts` |
| Encryption on the server (NFR 1) | Patient names AES-256-GCM; photos AES-256-GCM files bound to their image id, readable only by the API's user. Ages, counties, symptoms and notes are not field-encrypted: the server disk must be encrypted | `apps/api/src/security/fieldCrypto.ts`, `cases.test.ts` |
| Authentication (FR 1.1) | bcrypt (cost 12); per-account lockout after 5 failures for 15 minutes; **new:** failed logins limited per network address across accounts (30 per 10 minutes); tokens revoked on deactivation or reset; one clock for signing and checking | `apps/api/src/routes/auth.ts`, `apps/api/src/http/rateLimit.ts`, `auth.test.ts`, `hardening.test.ts` |
| Offline login (FR 1.1) | PIN hash in the Keychain/Keystore; 5 wrong offline PINs remove it; the server's answer wins when online. **Fixed:** a 429 no longer removes the offline login | `apps/mobile/src/core/offlineAuth.ts`, `offlineAuth.test.ts` |
| Unattended phone | **New:** the app asks for the PIN again after 5 minutes in the background | `apps/mobile/src/core/appLock.ts`, `appLock.test.ts` |
| Access control (FR 1.2) | One shared permission table; deny by default; ownership checks for CHWs; 403 before loading a resource for roles that may never access it | `packages/shared/src/access/permissions.ts`, `access.test.ts` |
| Data minimisation (NFR 6) | Dentists never receive names (tested); EXIF and GPS dropped from photos; location, microphone, storage and overlay permissions blocked; Android backup off; **new:** abandoned uploads deleted after 7 days | `dashboard.test.ts`, `apps/mobile/app.json`, `hardening.test.ts` |
| Audit log (FR 8.2, NFR 4) | Every guarded request logged, including denied ones and rate-limited logins; a trigger blocks UPDATE, DELETE and TRUNCATE; the API's database user cannot delete | `auditLog.test.ts` |
| Input validation | Zod on every request body and query; UUIDs checked; body limits (JSON 100 KB, photo 2 MB, Caddy 3 MB) | `packages/shared/src/domain/*.ts` |
| Browser security | Strict Content-Security-Policy, `frame-ancestors 'none'`, no-referrer; photos sent with `no-store` and shown from revocable blob URLs; session in `sessionStorage` (8 hours) | `infra/caddy/Caddyfile`, `apps/web/src/pages/CasePage.tsx` |
| Containers | API runs as a non-root user; the database is bound to 127.0.0.1; the server image holds only API dependencies | `apps/api/Dockerfile`, `docker-compose.yml` |
| Secrets | No secrets in git history (checked every commit for env files, keys and the current secret values); `.env` and backups are git-ignored | this review |
| Dependencies | `npm audit --omit=dev`: 9 advisories, all inside Expo's build tooling (`@expo/cli` and its packages). None ships in the API image or the phone app. Re-check when Expo publishes a fixed patch | this review |
| Backups (NFR 7) | Backup, verify and restore scripts; verify proved a full restore | `scripts/` |

## Open risks and recommendations

1. **Server disk encryption.** PostgreSQL does not encrypt ages, counties, symptoms or notes. Any real deployment must use an encrypted disk or volume. Backups need the same.
2. **Key management.** `PATIENT_DATA_KEY` encrypts names and photos. If it is lost, they cannot be recovered; if it leaks, they can be read. Store it in a secrets manager or offline, apart from backups. Key rotation is not built: the `v1` prefix leaves room for it.
3. **Erasure requests (Kenya DPA 2019).** Drafts can be deleted on the phone, but nothing deletes a patient on the server (open question 6). A controlled, audited admin process is needed before real data.
4. **Screenshots and recent-apps previews on the phone.** Android shows a snapshot of the app in the recent-apps list, and screenshots are allowed. Blocking them (`expo-screen-capture`) is a small first-party addition, but it also stops CHWs from screenshotting for support. Decide before the field test.
5. **No second factor for administrators.** Admin accounts can create users and read the audit log. Add a second factor before a public deployment.
6. **Rate limit is in memory.** It resets when the API restarts and assumes one API process. The per-account lockout is stored in the database, so PINs stay protected.
7. **Development builds.** The field must use a release build. Debug builds trust user-installed certificates and the local Caddy authority, and load code from a development machine.
8. **Audit log growth.** Nothing deletes audit entries, which meets the 12-month rule but grows forever. Plan archiving of entries older than the retention period.
