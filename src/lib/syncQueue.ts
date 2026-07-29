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

export async function enqueue(op: Omit<SyncOperation, 'opId'>): Promise<void> {
  await writeQueue([...(await peekQueue()), { ...op, opId: nextOpId() }]);
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
    { ...op, opId: nextOpId() },
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
