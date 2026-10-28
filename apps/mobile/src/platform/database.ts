/** NFR 1: opens the SQLCipher database on one connection (see core/serialDb). */
import { getRandomBytes } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { DB_FILE_NAME, openLocalDb } from '../core/localDb';
import type { SqlDb } from '../core/ports';
import { serializedDb } from '../core/serialDb';
import { secureKV } from './secureKV';

export async function openDatabase(): Promise<SqlDb> {
  // expo-sqlite runs no statement on open, so PRAGMA key in openLocalDb is the first one.
  const conn = await SQLite.openDatabaseAsync(DB_FILE_NAME);
  const db = serializedDb({
    execAsync: (sql) => conn.execAsync(sql),
    runAsync: (sql, params = []) => conn.runAsync(sql, params),
    getAllAsync: (sql, params = []) => conn.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => conn.getFirstAsync(sql, params),
  });
  await openLocalDb(db, secureKV, getRandomBytes);
  return db;
}
