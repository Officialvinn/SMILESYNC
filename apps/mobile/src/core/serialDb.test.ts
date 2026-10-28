/**
 * NFR 1 + FR 4.2: one SQLCipher connection, with transactions serialised in
 * JavaScript. expo-sqlite's exclusive transactions open a second connection
 * that would not have the encryption key or foreign keys turned on.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { serializedDb } from './serialDb';

function rawNode() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    execAsync: async (sql: string) => void raw.exec(sql),
    runAsync: async (sql: string, p: (string | number | null | Uint8Array)[] = []) => {
      raw.prepare(sql).run(...p);
    },
    getAllAsync: async <T,>(sql: string, p: (string | number | null | Uint8Array)[] = []) => raw.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, p: (string | number | null | Uint8Array)[] = []) =>
      (raw.prepare(sql).get(...p) as T | undefined) ?? null,
  };
}

describe('serializedDb', () => {
  it('a statement issued during a transaction waits, so a rollback cannot undo it', async () => {
    const node = rawNode();
    const db = serializedDb(node);
    await db.execAsync('CREATE TABLE t (v TEXT)');

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tx = db.transaction(async (t) => {
      await t.runAsync("INSERT INTO t VALUES ('inside')");
      await gate;
      throw new Error('fail');
    });
    const outside = db.runAsync("INSERT INTO t VALUES ('outside')");
    release();
    await expect(tx).rejects.toThrow('fail');
    await outside;
    expect(await db.getAllAsync('SELECT v FROM t')).toEqual([{ v: 'outside' }]);
  });

  it('commits on success and keeps working after a failed transaction', async () => {
    const db = serializedDb(rawNode());
    await db.execAsync('CREATE TABLE t (v INTEGER)');
    await expect(db.transaction(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await db.transaction(async (t) => {
      await t.runAsync('INSERT INTO t VALUES (?)', [1]);
      await t.transaction(async (inner) => {
        await inner.runAsync('INSERT INTO t VALUES (?)', [2]); // nested: joins the outer transaction
      });
    });
    expect(await db.getFirstAsync('SELECT sum(v) AS s FROM t')).toEqual({ s: 3 });
  });
});
