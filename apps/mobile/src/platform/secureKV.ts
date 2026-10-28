/** SecureKV on the iOS Keychain / Android Keystore. Never backed up or moved to another device. */
import * as SecureStore from 'expo-secure-store';
import type { SecureKV } from '../core/ports';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureKV: SecureKV = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  delete: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};
