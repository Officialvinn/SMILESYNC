/**
 * SqlDb over Node's built-in SQLite, so the local schema and queries are
 * tested against a real SQLite engine. Node's SQLite has no SQLCipher, which
 * the unlock tests rely on to prove the app refuses an unencrypted database.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlValue } from '../src/core/ports';
import { serializedDb } from '../src/core/serialDb';

export function openMemoryDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const db = serializedDb({
    execAsync: async (sql) => void raw.exec(sql),
    runAsync: async (sql, params: SqlValue[] = []) => raw.prepare(sql).run(...params),
    getAllAsync: async <T,>(sql: string, params: SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlValue[] = []) => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
  });
  return Object.assign(db, { raw });
}

export class MemoryKV {
  readonly data = new Map<string, string>();
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.data.set(k, v);
  }
  async delete(k: string) {
    this.data.delete(k);
  }
}

let counter = 0;
/** Deterministic, valid v4-shaped UUIDs for tests. */
export function testUuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export function seqRandom(): (n: number) => Uint8Array {
  let x = 1;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 75 + 74) % 65537) & 0xff);
}
