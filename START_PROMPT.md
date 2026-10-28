Read CLAUDE.md first, then docs/SmileSync_SRS.md and the four diagrams in
docs/diagrams/ (use case, class, sequence, activity).

We are building SmileSync: an offline-first teledentistry system. Community
health workers in rural Kenya capture oral images and symptoms on a phone
with no internet needed, and the data syncs later to a cloud server. Remote
dentists triage cases on a web dashboard (Routine / Urgent / Emergency) with
clinical notes, and the result returns to the CHW's app. I'm the sole
developer, so prefer simple, well-documented, boring technology.

All the decisions you asked about earlier are recorded in CLAUDE.md (case
status meaning, patient data handling, image views, edit rules, hosting,
offline login). The stack there is approved.

Do this now:
1. Check your data model and API against the class and sequence diagrams and
   tell me where they differ from your plan or from the SRS.
2. Then start Sprint 0: monorepo skeleton, docker-compose, CI, Prisma schema
   from the class diagram, seed data, auth and role-based access (FR 1).
   Write the access-rule tests and the sync-engine tests (plain TypeScript in
   packages/shared) first.
3. Create docs/TRACEABILITY.md and keep it updated.
4. When Sprint 0 is done, stop and report: what works, what is stubbed, which
   FR/NFR IDs are covered, and the exact commands to run it.

Don't start Sprint 1 until I say so.
