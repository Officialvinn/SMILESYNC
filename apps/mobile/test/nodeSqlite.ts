/**
 * SqlDb over Node's built-in SQLite, so the local schema and queries are
 * tested against a real SQLite engine. Node's SQLite has no SQLCipher, which
 * the unlock tests rely on to prove the app refuses an unencrypted database.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlValue } from '../src/core/ports';

export function openMemoryDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const db: SqlDb & { raw: DatabaseSync } = {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params: SqlValue[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async transaction(task) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db;
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
