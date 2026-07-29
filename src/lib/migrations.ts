import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOAL_DEFINITIONS_KEY, SCHEMA_VERSION_KEY, goalCountsKey, goalTargetsKey } from '../constants/storageKeys';

const CURRENT_VERSION = 1;

/** Bare week key, e.g. "2025-W21". Matches getWeekKey() in utils/dateUtils. */
const WEEK = /^\d{4}-W\d{2}$/;

/**
 * v1: the legacy "indicator" persistence names became "goal" names.
 *
 * Legacy keys are copied, never moved — the originals stay put as a local
 * backup. Note that is NOT a real backup: an uninstall takes it with everything
 * else, and it goes stale the moment the new build writes anything.
 */
function planRenames(keys: readonly string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const key of keys) {
    if (key === 'indicator_definitions') {
      out.push({ from: key, to: GOAL_DEFINITIONS_KEY });
    } else if (key.startsWith('indicator_goals_')) {
      const wk = key.slice('indicator_goals_'.length);
      // Validating the shape keeps a stray `indicator_goals_v2` from being
      // copied onto a name a hook will read as real data.
      if (WEEK.test(wk)) out.push({ from: key, to: goalTargetsKey(wk) });
    } else if (key.startsWith('indicators_')) {
      const wk = key.slice('indicators_'.length);
      if (WEEK.test(wk)) out.push({ from: key, to: goalCountsKey(wk) });
    }
  }
  return out;
}

async function migrateToV1(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const existing = new Set(keys);

  // Never overwrite a destination that already exists. This — not the version
  // stamp — is what makes the migration idempotent: a re-run after the user has
  // logged a week must not revert it to the legacy snapshot.
  const todo = planRenames(keys).filter(r => !existing.has(r.to));

  if (todo.length > 0) {
    // Raw byte copy rather than getItem/setItem: getItem swallows JSON.parse
    // failures and returns null, which would silently turn a corrupt legacy
    // value into "no data" at the destination.
    const pairs = await AsyncStorage.multiGet(todo.map(r => r.from));
    const dest = new Map(todo.map(r => [r.from, r.to]));
    const writes = pairs
      .filter(([, value]) => value != null)
      .map(([from, value]) => [dest.get(from)!, value!] as [string, string]);
    await AsyncStorage.multiSet(writes);
    console.log(`[migrate] copied ${writes.length} legacy key(s) forward`);
  }

  // Anything queued names tables that no longer exist, so every op would 404
  // and re-queue forever. The watermark has to go too — it was stamped against
  // the old schema, and a stale one would skip the first full pull.
  await AsyncStorage.multiRemove(['sync_queue', 'last_synced_at']);
}

async function run(): Promise<void> {
  const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  const version = raw ? Number(JSON.parse(raw)) : 0;
  if (version >= CURRENT_VERSION) return;

  if (version < 1) await migrateToV1();

  // Written last: an interrupted run leaves this unbumped and simply reruns,
  // which is safe because the copy step is idempotent.
  await AsyncStorage.setItem(SCHEMA_VERSION_KEY, JSON.stringify(CURRENT_VERSION));
}

/**
 * Starts evaluating on first import — before React renders anything — so the
 * gate in App.tsx and the awaits in sync.ts are all waiting on the same run.
 * A failure must never brick boot: legacy keys are untouched and the version
 * stays unwritten, so the next launch retries.
 */
export const migrationsReady: Promise<void> = run().catch(e => {
  console.log('[migrate] failed, will retry next launch:', e);
});
