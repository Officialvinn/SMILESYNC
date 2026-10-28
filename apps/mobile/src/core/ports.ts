/**
 * Interfaces the core logic needs from the phone. The Expo adapters in
 * src/platform implement them on the device; test/ implements them in Node.
 * Keeping Expo out of src/core lets the core run in plain Vitest.
 */

/** A value SQLite can bind. Uint8Array is stored as a BLOB. */
export type SqlValue = string | number | null | Uint8Array;

/** The subset of expo-sqlite's SQLiteDatabase the app uses. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Runs `task` in one exclusive transaction; rolls back if it throws. */
  transaction(task: (tx: SqlDb) => Promise<void>): Promise<void>;
}

/** Key-value store backed by the iOS Keychain / Android Keystore (expo-secure-store). */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type RandomBytes = (n: number) => Uint8Array;
