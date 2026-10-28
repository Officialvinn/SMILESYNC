/**
 * NFR 1: the phone's database is SQLCipher (AES-256). The key is 32 random
 * bytes kept in the Keychain / Keystore, separate from the CHW's PIN, so a
 * forgotten PIN never makes saved cases unreadable.
 *
 * Fail closed: if SQLCipher is not active (for example a build without the
 * expo-sqlite "useSQLCipher" option), the app refuses to store anything.
 */
import type { RandomBytes, SecureKV, SqlDb } from './ports';
import { toHex } from './hex';

export const DB_KEY_NAME = 'db.key.v1';
export const DB_FILE_NAME = 'smilesync.db';
const KEY_PATTERN = /^[0-9a-f]{64}$/;

export class DatabaseNotEncryptedError extends Error {
  constructor() {
    super('This build cannot encrypt data on the phone. Patient data will not be saved. Contact support.');
    this.name = 'DatabaseNotEncryptedError';
  }
}

export async function getOrCreateDbKey(kv: SecureKV, randomBytes: RandomBytes): Promise<string> {
  const existing = await kv.get(DB_KEY_NAME);
  if (existing && KEY_PATTERN.test(existing)) return existing;
  const key = toHex(randomBytes(32));
  await kv.set(DB_KEY_NAME, key);
  return key;
}

/** Unlocks the database, checks that it is encrypted, then migrates it. */
export async function openLocalDb(db: SqlDb, kv: SecureKV, randomBytes: RandomBytes): Promise<void> {
  const key = await getOrCreateDbKey(kv, randomBytes);
  // PRAGMA cannot take bound parameters; KEY_PATTERN guarantees the key is 64 hex characters.
  // The x'..' form is a raw 256-bit key, so SQLCipher skips its password KDF.
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) throw new DatabaseNotEncryptedError();
  await migrate(db);
}

/**
 * Local schema. Mirrors the server's tables (class diagram B.2) plus the sync
 * columns from LocalCase in packages/shared. A draft is a case whose
 * submitted_at is NULL: the CHW is still capturing. Sprint 2 sets submitted_at
 * when the questionnaire is done, which makes the case Pending for sync.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE patients (
    id            TEXT PRIMARY KEY,
    anon_id       TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    age           INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
    location      TEXT NOT NULL,
    sex           TEXT,
    consent_given INTEGER NOT NULL CHECK (consent_given = 1),
    consent_date  TEXT NOT NULL,
    registered_by TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE cases (
    id              TEXT PRIMARY KEY,
    patient_id      TEXT NOT NULL REFERENCES patients(id),
    chw_id          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    submitted_at    TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SYNCED', 'REVIEWED')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    next_attempt_at TEXT,
    last_error      TEXT,
    needs_attention INTEGER NOT NULL DEFAULT 0,
    synced_at       TEXT,
    priority        TEXT,
    reviewed_at     TEXT,
    notes_json      TEXT NOT NULL DEFAULT '[]',
    CHECK (status = 'PENDING' OR submitted_at IS NOT NULL)
  );
  CREATE INDEX cases_chw_created ON cases (chw_id, created_at);
  CREATE TABLE images (
    id          TEXT PRIMARY KEY,
    case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    view_type   TEXT NOT NULL CHECK (view_type IN ('FRONT', 'UPPER_ARCH', 'LOWER_ARCH', 'EXTRA')),
    bytes       BLOB NOT NULL,
    size_bytes  INTEGER NOT NULL,
    sha256      TEXT NOT NULL,
    captured_at TEXT NOT NULL
  );
  CREATE INDEX images_case ON images (case_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  // Per connection, so it runs on every open.
  await db.execAsync('PRAGMA foreign_keys = ON');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.execAsync(MIGRATIONS[v]!);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
