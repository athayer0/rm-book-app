import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silent
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // silent
  }
}

export async function getAllKeys(): Promise<readonly string[]> {
  try {
    return await AsyncStorage.getAllKeys();
  } catch {
    return [];
  }
}

export async function multiGet(keys: string[]): Promise<Record<string, unknown>> {
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    const result: Record<string, unknown> = {};
    pairs.forEach(([key, value]) => {
      if (value) result[key] = JSON.parse(value);
    });
    return result;
  } catch {
    return {};
  }
}
