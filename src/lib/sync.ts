import { supabase } from './supabase';
import { peekQueue, removeOps, SyncOperation } from './syncQueue';
import { getAllKeys, getItem, setItem, subscribe } from '../utils/storage';
import { toRow, fromRow, PK_COLUMNS } from './rowMappers';
import {
  CALENDAR_EVENTS_KEY,
  CONVERT_PROGRESS_KEY,
  EVENT_STATUSES_KEY,
  GOAL_DEFINITIONS_KEY,
  LAST_SYNCED_KEY,
  PEOPLE_KEY,
  SETTINGS_KEY,
  goalCountsKey,
  goalTargetsKey,
  goalMonthlyCountsKey,
  goalMonthlyTargetsKey,
  statusKey,
} from '../constants/storageKeys';

/** Tables that map 1:1 onto a local array stored under a single AsyncStorage key. */
const ROW_TABLES = [
  { table: 'people', storageKey: PEOPLE_KEY },
  { table: 'calendar_events', storageKey: CALENDAR_EVENTS_KEY },
  { table: 'goal_definitions', storageKey: GOAL_DEFINITIONS_KEY },
  { table: 'convert_progress', storageKey: CONVERT_PROGRESS_KEY },
] as const;

let inFlight: Promise<void> | null = null;

/**
 * Push queued operations to Supabase.
 *
 * Concurrent callers share one run. Several triggers can fire at once —
 * foreground, a network transition, and the post-write debounce — and without
 * this they would each read the same queue and send the same rows in parallel.
 */
export function drainQueue(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runDrain().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runDrain(): Promise<void> {
  const ops = await peekQueue();
  if (ops.length === 0) return;

  const sent: SyncOperation[] = [];

  for (const op of ops) {
    try {
      const pk = PK_COLUMNS[op.table];
      if (!pk) throw new Error(`unknown table ${op.table}`);

      if (op.type === 'upsert') {
        const { error } = await supabase
          .from(op.table)
          .upsert(toRow(op.table, op.row), { onConflict: pk.join(',') });
        if (error) throw error;
      } else {
        // Soft delete. `updated_at` is bumped by the table's trigger, which is
        // what lets the tombstone show up in another device's incremental pull.
        const match: Record<string, unknown> = {};
        for (const col of pk) match[col] = op.row[col];
        const { error } = await supabase
          .from(op.table)
          .update({ deleted_at: new Date().toISOString() })
          .match(match);
        if (error) throw error;
      }
      sent.push(op);
    } catch (e) {
      console.log(`[sync] ${op.type} ${op.table} failed:`, e);
    }
  }

  // Silent when there was nothing queued, so this stays quiet at rest rather
  // than logging on every trigger.
  const tables = [...new Set(sent.map(op => op.table))].join(', ');
  console.log(`[sync] pushed ${sent.length}/${ops.length}${tables ? ` (${tables})` : ''}`);

  // Ops are removed only once confirmed sent, so a crash mid-drain retries them
  // rather than dropping them.
  await removeOps(sent);
}

/** How long to wait after the last write before pushing. */
const AUTO_DRAIN_DELAY_MS = 3000;

/**
 * Push shortly after writes stop.
 *
 * Without this the only triggers are sign-in, a network transition, and sign-out
 * — so a long-running session could hold changes on-device for days. The delay
 * is what keeps a burst (tapping a goal counter five times, dragging a colour
 * slider) from becoming five requests: each write resets the timer, and
 * enqueueUpsert has already collapsed them to one row by the time it fires.
 *
 * Driven by the storage subscription rather than a call inside enqueue(), which
 * would mean syncQueue importing sync and closing an import cycle.
 */
export function startAutoDrain(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = subscribe('sync_queue', value => {
    // A drain that empties the queue writes to this key too; nothing to do.
    if (!Array.isArray(value) || value.length === 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      drainQueue();
    }, AUTO_DRAIN_DELAY_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/**
 * Pull server state down and merge it into AsyncStorage.
 *
 * Runs incrementally off `last_synced_at` when the local copy already has data,
 * and falls back to a full pull per-table when it doesn't — otherwise a device
 * with an empty cache but a stale timestamp could never recover the full set.
 *
 * Every write here goes through setItem(), which notifies subscribers, so the
 * live screens adopt pulled data without this module knowing they exist.
 */
export function pullAll(userId: string): Promise<void> {
  // Same reasoning as drainQueue: sign-in and foreground can overlap, and the
  // merge steps below are read-modify-write against AsyncStorage — two runs
  // interleaving would drop whichever write landed first.
  if (pullInFlight) return pullInFlight;
  pullInFlight = runPull(userId).finally(() => {
    pullInFlight = null;
  });
  return pullInFlight;
}

let pullInFlight: Promise<void> | null = null;

async function runPull(userId: string): Promise<void> {
  const lastSynced = await getItem<string>(LAST_SYNCED_KEY);
  // The watermark is the newest updated_at actually seen, not the client clock:
  // updated_at is stamped by a server-side trigger, so comparing against a local
  // timestamp would silently drop rows whenever the two clocks disagree.
  let highWater = lastSynced ?? '';

  async function pull(table: string, since: string | null) {
    let query = supabase.from(table).select('*').eq('user_id', userId);
    if (since) {
      // Incremental: tombstones have to come through so deletes made on another
      // device propagate. A full pull can skip them — there's nothing to remove.
      query = query.gt('updated_at', since);
    } else {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      const stamp = String(row.updated_at ?? '');
      if (stamp > highWater) highWater = stamp;
    }
    console.log(`[sync] ${table}: pulled=${rows.length} (${since ? 'incremental' : 'full'})`);
    return rows;
  }

  for (const { table, storageKey } of ROW_TABLES) {
    const local = (await getItem<Record<string, unknown>[]>(storageKey)) ?? [];
    const rows = await pull(table, local.length > 0 ? lastSynced : null);
    if (rows.length === 0) continue;

    const byId = new Map(local.map(item => [item.id as string, item]));
    for (const row of rows) {
      const id = row.id as string;
      if (row.deleted_at) byId.delete(id);
      else byId.set(id, fromRow(table, row));
    }
    await setItem(storageKey, [...byId.values()]);
  }

  await pullGoalEntries(lastSynced, pull);
  await pullGoalMonthlyEntries(lastSynced, pull);
  await pullEventStatuses(lastSynced, pull);
  await pullSettings(userId);

  if (highWater) await setItem(LAST_SYNCED_KEY, highWater);
}

type Puller = (table: string, since: string | null) => Promise<Record<string, unknown>[]>;

/**
 * goal_entries carries both `count` and `target`, which live in two separate
 * local key families. Each is written only when the column is non-null — a
 * target-only row must not fabricate a count of 0, since resolveGoal() treats
 * "unset" and 0 as different answers.
 */
async function pullGoalEntries(since: string | null, pull: Puller): Promise<void> {
  // Full pull unless this device already holds some week's goal data.
  const hasLocal = (await getAllKeys()).some(k => k.startsWith('goal_counts_'));
  const rows = await pull('goal_entries', hasLocal ? since : null);
  if (rows.length === 0) return;

  const counts = new Map<string, Record<string, number>>();
  const targets = new Map<string, Record<string, number>>();

  async function bucket(map: Map<string, Record<string, number>>, key: string, wk: string) {
    if (!map.has(wk)) map.set(wk, (await getItem<Record<string, number>>(key)) ?? {});
    return map.get(wk)!;
  }

  for (const row of rows) {
    const wk = String(row.week_key);
    const goalId = String(row.goal_id);
    const countBucket = await bucket(counts, goalCountsKey(wk), wk);
    const targetBucket = await bucket(targets, goalTargetsKey(wk), wk);

    if (row.deleted_at) {
      delete countBucket[goalId];
      delete targetBucket[goalId];
      continue;
    }
    if (row.count !== null && row.count !== undefined) countBucket[goalId] = Number(row.count);
    if (row.target !== null && row.target !== undefined) targetBucket[goalId] = Number(row.target);
  }

  for (const [wk, value] of counts) await setItem(goalCountsKey(wk), value);
  for (const [wk, value] of targets) await setItem(goalTargetsKey(wk), value);
}

/** Same shape as pullGoalEntries, one grain up: month_key instead of week_key. */
async function pullGoalMonthlyEntries(since: string | null, pull: Puller): Promise<void> {
  const hasLocal = (await getAllKeys()).some(k => k.startsWith('goal_monthly_counts_'));
  const rows = await pull('goal_monthly_entries', hasLocal ? since : null);
  if (rows.length === 0) return;

  const counts = new Map<string, Record<string, number>>();
  const targets = new Map<string, Record<string, number>>();

  async function bucket(map: Map<string, Record<string, number>>, key: string, mk: string) {
    if (!map.has(mk)) map.set(mk, (await getItem<Record<string, number>>(key)) ?? {});
    return map.get(mk)!;
  }

  for (const row of rows) {
    const mk = String(row.month_key);
    const goalId = String(row.goal_id);
    const countBucket = await bucket(counts, goalMonthlyCountsKey(mk), mk);
    const targetBucket = await bucket(targets, goalMonthlyTargetsKey(mk), mk);

    if (row.deleted_at) {
      delete countBucket[goalId];
      delete targetBucket[goalId];
      continue;
    }
    if (row.count !== null && row.count !== undefined) countBucket[goalId] = Number(row.count);
    if (row.target !== null && row.target !== undefined) targetBucket[goalId] = Number(row.target);
  }

  for (const [mk, value] of counts) await setItem(goalMonthlyCountsKey(mk), value);
  for (const [mk, value] of targets) await setItem(goalMonthlyTargetsKey(mk), value);
}

async function pullEventStatuses(since: string | null, pull: Puller): Promise<void> {
  const local = await getItem<Record<string, string>>(EVENT_STATUSES_KEY);
  const rows = await pull('event_statuses', local === null ? null : since);
  if (rows.length === 0) return;

  const merged = { ...(local ?? {}) };
  for (const row of rows) {
    const key = statusKey(String(row.event_id), String(row.occurrence_date));
    if (row.deleted_at) delete merged[key];
    else merged[key] = String(row.status);
  }
  await setItem(EVENT_STATUSES_KEY, merged);
}

async function pullSettings(userId: string): Promise<void> {
  // No row exists until the user changes something, so maybeSingle() rather than
  // single() — the latter errors on zero rows.
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.log('[sync] settings pull failed:', error);
    return;
  }
  if (!data) return;

  // fromRow skips nulls, so a column the server has never had written can't
  // clobber the local value.
  const local = (await getItem<Record<string, unknown>>(SETTINGS_KEY)) ?? {};
  await setItem(SETTINGS_KEY, { ...local, ...fromRow('settings', data) });
}
