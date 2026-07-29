import AsyncStorage from '@react-native-async-storage/async-storage';

// Writes are announced per key so that anything holding a copy of a value can
// adopt a newer one. This is what lets pullAll() write straight to AsyncStorage
// and still have the live screens update: every pull write goes through
// setItem(), so subscribers hear about it without sync.ts knowing they exist.
type Listener = (value: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

function notify(key: string, value: unknown): void {
  const set = listeners.get(key);
  if (!set) return;
  // Copied so a listener that unsubscribes itself can't mutate the set mid-walk.
  for (const fn of [...set]) fn(value);
}

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
    return; // Nothing was written, so nothing to announce.
  }
  notify(key, value);
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    return;
  }
  notify(key, null);
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

export async function multiRemove(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    return;
  }
  // null tells subscribers to fall back to their initial value, so the screens
  // empty out live rather than showing the cleared account's data.
  for (const key of keys) notify(key, null);
}

export async function multiSet(entries: [string, unknown][]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await AsyncStorage.multiSet(entries.map(([k, v]) => [k, JSON.stringify(v)]));
  } catch {
    return;
  }
  for (const [key, value] of entries) notify(key, value);
}
