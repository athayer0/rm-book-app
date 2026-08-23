import { getAllKeys, multiRemove } from '../utils/storage';
import { isClearableKey } from '../constants/storageKeys';

/**
 * Wipe this device's copy of the user's data.
 *
 * Nothing here is namespaced per account, so without this a second user signing
 * in on the same device would see the first user's rows — and, worse, push them
 * back up under their own user_id the moment they edited anything.
 *
 * The sync bookkeeping keys go too — see DEVICE_LOCAL_KEYS in storageKeys.
 */
export async function clearLocalData(): Promise<void> {
  const keys = (await getAllKeys()).filter(isClearableKey);
  await multiRemove(keys);
}

export type ClearResult = { cleared: boolean; pending: number };
