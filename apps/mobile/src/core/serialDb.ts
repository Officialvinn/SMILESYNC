/**
 * Wraps a single database connection so every statement runs one at a time,
 * and a transaction holds the connection until it commits or rolls back.
 *
 * Why not expo-sqlite's withExclusiveTransactionAsync: it opens a second
 * connection, which would not have the SQLCipher key (NFR 1) or
 * PRAGMA foreign_keys set. One connection keeps both guarantees.
 */
import type { SqlDb, SqlValue } from './ports';

/** A single connection: SqlDb without transactions. */
export type RawSql = Omit<SqlDb, 'transaction' | 'runAsync'> & {
  runAsync(sql: string, params?: SqlValue[]): Promise<unknown>;
};

export function serializedDb(raw: RawSql): SqlDb {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };

  const direct: SqlDb = {
    execAsync: (sql) => raw.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const r = await raw.runAsync(sql, params);
      const changes = (r as { changes?: number } | undefined)?.changes;
      return { changes: typeof changes === 'number' ? changes : 0 };
    },
    getAllAsync: (sql, params = []) => raw.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => raw.getFirstAsync(sql, params),
    // Already inside a transaction: a nested one joins it.
    transaction: (task) => task(direct),
  };

  return {
    execAsync: (sql) => enqueue(() => direct.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => direct.runAsync(sql, params)),
    getAllAsync: (sql, params) => enqueue(() => direct.getAllAsync(sql, params)),
    getFirstAsync: (sql, params) => enqueue(() => direct.getFirstAsync(sql, params)),
    transaction: (task) =>
      enqueue(async () => {
        await raw.execAsync('BEGIN IMMEDIATE');
        try {
          await task(direct);
        } catch (e) {
          await raw.execAsync('ROLLBACK');
          throw e;
        }
        await raw.execAsync('COMMIT');
      }),
  };
}
