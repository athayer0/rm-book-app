import { getItem, setItem } from '../utils/storage';

export type SyncOperation = {
  /** Stable across the AsyncStorage round-trip, so the drainer can drop sent ops. */
  opId: string;
  table: string;
  row: Record<string, unknown>;
  type: 'upsert' | 'delete';
  /** `table:identity` — lets a newer write for the same row replace a queued one. */
  tag?: string;
};

const QUEUE_KEY = 'sync_queue';

let counter = 0;
function nextOpId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export async function peekQueue(): Promise<SyncOperation[]> {
  return (await getItem<SyncOperation[]>(QUEUE_KEY)) ?? [];
}

async function writeQueue(queue: SyncOperation[]): Promise<void> {
  await setItem(QUEUE_KEY, queue);
}

/**
 * Stamp an op with its id, and turn every `undefined` field into `null`.
 *
 * The queue is persisted, and JSON.stringify drops keys whose value is
 * `undefined` — so a field cleared locally arrived at the drainer as an absent
 * key rather than an empty one. PostgREST builds an upsert's SET list from the
 * keys present, which meant the column kept its old server-side value and the
 * next pull handed it straight back: taking the last person off an event, or
 * switching a series off, undid itself on reload.
 *
 * `null` survives the round-trip and is what toRow would have produced anyway.
 * The "send only the columns you own" rule is untouched — a key the caller never
 * passed is still absent, and only goal_entries relies on that.
 */
function stamp(op: Omit<SyncOperation, 'opId'>): SyncOperation {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(op.row)) {
    row[key] = value === undefined ? null : value;
  }
  return { ...op, row, opId: nextOpId() };
}

export async function enqueue(op: Omit<SyncOperation, 'opId'>): Promise<void> {
  await writeQueue([...(await peekQueue()), stamp(op)]);
}

/**
 * Queue an upsert, dropping any op already queued for the same row.
 *
 * Without this the queue grows per keystroke — editing a goal re-enqueues every
 * definition on each `onChangeText`, and each settings tap queues another full
 * settings row. Only the last write for a given row matters.
 */
export async function enqueueUpsert(
  table: string,
  identity: string,
  row: Record<string, unknown>,
): Promise<void> {
  await replaceTagged({ table, type: 'upsert', row, tag: `${table}:${identity}` });
}

export async function enqueueDelete(
  table: string,
  identity: string,
  row: Record<string, unknown>,
): Promise<void> {
  await replaceTagged({ table, type: 'delete', row, tag: `${table}:${identity}` });
}

async function replaceTagged(op: Omit<SyncOperation, 'opId'>): Promise<void> {
  const queue = await peekQueue();
  await writeQueue([
    ...queue.filter(existing => existing.tag !== op.tag),
    stamp(op),
  ]);
}

/**
 * Drop ops that have been confirmed sent.
 *
 * Deliberately not a `dequeue()` that clears the whole queue up front: the
 * drainer is fired unawaited from the NetInfo listener, so a clear-then-send
 * would lose every un-redelivered op if the process died mid-drain. Matching is
 * by `opId` because the queue is re-read from storage here — object identity
 * would never match across the JSON round-trip.
 */
export async function removeOps(sent: SyncOperation[]): Promise<void> {
  if (sent.length === 0) return;
  const done = new Set(sent.map(op => op.opId));
  await writeQueue((await peekQueue()).filter(op => !done.has(op.opId)));
}
