import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'fiftylist.secure',
};

async function canUseSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  }
  return AsyncStorage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    return;
  }
  await AsyncStorage.removeItem(key);
}

export async function getSecureJson<T>(key: string): Promise<T | null> {
  const raw = await getSecureItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setSecureJson<T>(key: string, value: T): Promise<void> {
  await setSecureItem(key, JSON.stringify(value));
}

export async function migrateKeyFromAsyncStorageToSecureStore(key: string): Promise<void> {
  const existingSecureValue = await getSecureItem(key);
  if (existingSecureValue) return;

  const legacyValue = await AsyncStorage.getItem(key);
  if (!legacyValue) return;

  await setSecureItem(key, legacyValue);
  await AsyncStorage.removeItem(key);
}
