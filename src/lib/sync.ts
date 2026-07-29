import { supabase } from './supabase';
import { dequeue, enqueue } from './syncQueue';
import { getItem, setItem } from '../utils/storage';

const LAST_SYNCED_KEY = 'last_synced_at';

export async function drainQueue(): Promise<void> {
  const ops = await dequeue();
  if (ops.length === 0) return;

  const failed: typeof ops = [];

  for (const op of ops) {
    try {
      if (op.type === 'upsert') {
        const { error } = await supabase.from(op.table).upsert(op.row);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(op.table)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', op.row.id as string);
        if (error) throw error;
      }
    } catch {
      failed.push(op);
    }
  }

  // Re-enqueue anything that failed
  for (const op of failed) await enqueue(op);
}

export async function pullAll(userId: string): Promise<{
  people: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  goalDefinitions: Record<string, unknown>[];
  goalEntries: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
}> {
  const lastSynced = await getItem<string>(LAST_SYNCED_KEY);

  async function pull(table: string) {
    let query = supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (lastSynced) query = query.gt('updated_at', lastSynced);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  // Table names keep their legacy "indicator" wording — renaming them would need a migration.
  const [people, calendarEvents, goalDefinitions, goalEntries] =
    await Promise.all([
      pull('people'),
      pull('calendar_events'),
      pull('indicator_definitions'),
      pull('indicator_entries'),
    ]);

  let settings: Record<string, unknown> | null = null;
  const { data: settingsData } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (settingsData) settings = settingsData;

  await setItem(LAST_SYNCED_KEY, new Date().toISOString());

  return { people, calendarEvents, goalDefinitions, goalEntries, settings };
}
