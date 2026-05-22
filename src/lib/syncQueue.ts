import { getItem, setItem } from '../utils/storage';

export type SyncOperation = {
  table: string;
  row: Record<string, unknown>;
  type: 'upsert' | 'delete';
};

const QUEUE_KEY = 'sync_queue';

export async function enqueue(op: SyncOperation): Promise<void> {
  const queue = (await getItem<SyncOperation[]>(QUEUE_KEY)) ?? [];
  queue.push(op);
  await setItem(QUEUE_KEY, queue);
}

export async function dequeue(): Promise<SyncOperation[]> {
  const queue = (await getItem<SyncOperation[]>(QUEUE_KEY)) ?? [];
  await setItem(QUEUE_KEY, []);
  return queue;
}

export async function peekQueue(): Promise<SyncOperation[]> {
  return (await getItem<SyncOperation[]>(QUEUE_KEY)) ?? [];
}
