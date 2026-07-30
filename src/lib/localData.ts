import { getAllKeys, multiRemove } from '../utils/storage';
import { isClearableKey } from '../constants/storageKeys';
import { peekQueue } from './syncQueue';
import { drainQueue } from './sync';

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

/**
 * Push everything outstanding, then clear — but only if the push fully
 * succeeded. Clearing with ops still queued would destroy work that exists
 * nowhere else, and losing the user's data is worse than the bleed this is
 * meant to prevent.
 */
export async function drainThenClear(): Promise<ClearResult> {
  try {
    await drainQueue();
  } catch {
    // Offline, or the drain threw. Fall through to the queue check below.
  }
  const pending = (await peekQueue()).length;
  if (pending > 0) return { cleared: false, pending };

  await clearLocalData();
  return { cleared: true, pending: 0 };
}
