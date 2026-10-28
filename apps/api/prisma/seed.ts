/**
 * Synthetic seed data for local development and demos. No real patients.
 * Safe to run repeatedly (upserts on fixed IDs). Refuses to run in production.
 *
 * Logins (all synthetic):
 *   admin1                       password SEED_PASSWORD
 *   dentist1, dentist2           password SEED_PASSWORD
 *   chw.narok1, chw.narok2, chw.marsabit1   PIN SEED_CHW_PIN
 */
import { createHash } from 'node:crypto';
import { generateAnonId, type County, type Priority, type SymptomDuration } from '@smilesync/shared';
import { createDb } from '../src/db.js';
import { hashSecret, validateNewSecret } from '../src/auth/passwords.js';
import { FieldCrypto } from '../src/security/fieldCrypto.js';

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const key = process.env.PATIENT_DATA_KEY;
const password = process.env.SEED_PASSWORD;
const pin = process.env.SEED_CHW_PIN;
if (!url || !key || !password || !pin) {
  throw new Error('Set DATABASE_URL, PATIENT_DATA_KEY, SEED_PASSWORD and SEED_CHW_PIN (see .env.example)');
}
for (const [role, secret] of [['ADMIN', password], ['CHW', pin]] as const) {
  const problem = validateNewSecret(role, secret);
  if (problem) throw new Error(`Seed ${role === 'CHW' ? 'PIN' : 'password'}: ${problem}`);
}

const db = createDb(url);
const crypto = new FieldCrypto(key);

/** Stable UUID from a label, so re-running the seed updates instead of duplicating. */
function seedUuid(label: string): string {
  const h = createHash('sha256').update(`smilesync-seed:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function main() {
  const passwordHash = await hashSecret(password!, 12);
  const pinHash = await hashSecret(pin!, 12);

  const users = [
    { username: 'admin1', role: 'ADMIN', passwordHash, adminLevel: 'SYSTEM' },
    { username: 'dentist1', role: 'DENTIST', passwordHash, licenseNumber: 'SYN-DEN-0001', specialty: 'General dentistry' },
    { username: 'dentist2', role: 'DENTIST', passwordHash, licenseNumber: 'SYN-DEN-0002', specialty: 'Oral surgery' },
    { username: 'chw.narok1', role: 'CHW', passwordHash: pinHash, chwCode: 'CHW-NRK-001', assignedSite: 'Synthetic Site A, Narok' },
    { username: 'chw.narok2', role: 'CHW', passwordHash: pinHash, chwCode: 'CHW-NRK-002', assignedSite: 'Synthetic Site B, Narok' },
    { username: 'chw.marsabit1', role: 'CHW', passwordHash: pinHash, chwCode: 'CHW-MRS-001', assignedSite: 'Synthetic Site C, Marsabit' },
  ] as const;

  const ids: Record<string, string> = {};
  for (const u of users) {
    const id = seedUuid(`user:${u.username}`);
    ids[u.username] = id;
    await db.user.upsert({ where: { username: u.username }, update: { ...u, isActive: true }, create: { id, ...u } });
  }

  // Synthetic cases: some waiting in the dentist queue (SYNCED), some already REVIEWED.
  const cases: { chw: string; county: County; age: number; pain: number; duration: SymptomDuration; review?: { priority: Priority; note: string; referral?: string } }[] = [
    { chw: 'chw.narok1', county: 'Narok', age: 34, pain: 8, duration: 'DAYS_1_TO_7' },
    { chw: 'chw.narok1', county: 'Narok', age: 9, pain: 3, duration: 'WEEKS_1_TO_4' },
    { chw: 'chw.narok2', county: 'Narok', age: 61, pain: 10, duration: 'LESS_THAN_1_DAY' },
    { chw: 'chw.marsabit1', county: 'Marsabit', age: 27, pain: 5, duration: 'MORE_THAN_1_MONTH' },
    {
      chw: 'chw.marsabit1', county: 'Marsabit', age: 45, pain: 9, duration: 'DAYS_1_TO_7',
      review: { priority: 'EMERGENCY', note: 'Synthetic note: facial swelling with suspected abscess.', referral: 'Refer to the nearest hospital today.' },
    },
    {
      chw: 'chw.narok2', county: 'Narok', age: 19, pain: 2, duration: 'WEEKS_1_TO_4',
      review: { priority: 'ROUTINE', note: 'Synthetic note: early caries on lower molar.', referral: 'Routine clinic visit within 3 months.' },
    },
  ];

  for (const [i, c] of cases.entries()) {
    const patientId = seedUuid(`patient:${i}`);
    const caseId = seedUuid(`case:${i}`);
    const createdAt = new Date(Date.UTC(2026, 9, 20 + i, 7, 30));
    const existing = await db.patient.findUnique({ where: { id: patientId } });
    if (!existing) {
      await db.patient.create({
        data: {
          id: patientId,
          anonId: generateAnonId(),
          nameEncrypted: crypto.encrypt(`Synthetic Patient ${i + 1}`),
          age: c.age,
          location: c.county,
          consentGiven: true,
          consentDate: createdAt,
          registeredById: ids[c.chw]!,
        },
      });
    }
    const reviewed = c.review
      ? { status: 'REVIEWED' as const, priority: c.review.priority, reviewedById: ids.dentist1!, reviewedAt: new Date(createdAt.getTime() + 6 * 3600_000) }
      : { status: 'SYNCED' as const };
    await db.case.upsert({
      where: { id: caseId },
      update: reviewed,
      create: { id: caseId, patientId, submittedById: ids[c.chw]!, createdAt, syncedAt: new Date(createdAt.getTime() + 3600_000), ...reviewed },
    });
    await db.symptomAssessment.upsert({
      where: { caseId },
      update: { painLevel: c.pain, duration: c.duration },
      create: { id: seedUuid(`assessment:${i}`), caseId, painLevel: c.pain, duration: c.duration },
    });
    if (c.review) {
      const noteId = seedUuid(`note:${i}`);
      await db.clinicalNote.upsert({
        where: { id: noteId },
        update: {},
        create: { id: noteId, caseId, authorId: ids.dentist1!, noteText: c.review.note, referralAdvice: c.review.referral ?? null },
      });
    }
  }
  // Images are seeded in Sprint 2, when encrypted image storage exists.
  console.log(`Seeded ${users.length} users and ${cases.length} synthetic cases.`);
}

main().finally(() => db.$disconnect());
