/**
 * NFR 1: the phone's database is encrypted with SQLCipher (AES-256) using a
 * random key kept in the Keychain / Keystore. FR 4.2: the schema it opens.
 */
import { describe, expect, it } from 'vitest';
import { MemoryKV, openMemoryDb, seqRandom } from '../../test/nodeSqlite.js';
import type { SqlDb } from './ports.js';
import { DB_KEY_NAME, DatabaseNotEncryptedError, getOrCreateDbKey, migrate, openLocalDb, SCHEMA_VERSION } from './localDb.js';

describe('database key (NFR 1)', () => {
  it('creates a 256-bit key once and reuses it', async () => {
    const kv = new MemoryKV();
    const key = await getOrCreateDbKey(kv, seqRandom());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await getOrCreateDbKey(kv, seqRandom())).toBe(key);
    expect(kv.data.get(DB_KEY_NAME)).toBe(key);
  });

  it('replaces a stored key that is not 64 hex characters rather than using it in SQL', async () => {
    const kv = new MemoryKV();
    await kv.set(DB_KEY_NAME, "abc'; DROP TABLE cases; --");
    expect(await getOrCreateDbKey(kv, seqRandom())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('openLocalDb (NFR 1, fail closed)', () => {
  it('refuses to use a database without SQLCipher', async () => {
    // Node's SQLite ignores PRAGMA key and has no cipher_version, like a build where SQLCipher was left out.
    const db = openMemoryDb();
    await expect(openLocalDb(db, new MemoryKV(), seqRandom())).rejects.toBeInstanceOf(DatabaseNotEncryptedError);
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables).toEqual([]); // nothing was written to the unencrypted file
  });

  it('sets the key before any other statement, then checks SQLCipher is active', async () => {
    const inner = openMemoryDb();
    const log: string[] = [];
    const spy: SqlDb = {
      ...inner,
      async execAsync(sql) {
        log.push(sql);
        if (!sql.startsWith('PRAGMA key')) await inner.execAsync(sql);
      },
      async getFirstAsync<T>(sql: string, params?: (string | number | null | Uint8Array)[]) {
        log.push(sql);
        if (sql === 'PRAGMA cipher_version') return { cipher_version: '4.6.1 community' } as T;
        return inner.getFirstAsync<T>(sql, params);
      },
    };
    const kv = new MemoryKV();
    await openLocalDb(spy, kv, seqRandom());
    expect(log[0]).toBe(`PRAGMA key = "x'${kv.data.get(DB_KEY_NAME)}'"`);
    expect(log[1]).toBe('PRAGMA cipher_version');
  });
});

describe('migrate (FR 4.2)', () => {
  it('creates the schema once and is safe to run again', async () => {
    const db = openMemoryDb();
    await migrate(db);
    await migrate(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(SCHEMA_VERSION);
    const tables = (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['cases', 'images', 'patients']));
  });

  it('turns on foreign keys', async () => {
    const db = openMemoryDb();
    await migrate(db);
    expect(await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  });
});
