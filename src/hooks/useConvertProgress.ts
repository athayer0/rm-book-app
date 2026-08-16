import { useCallback } from 'react';
import { CONVERT_PROGRESS_KEY } from '../constants/storageKeys';
import { DEFAULT_COMPLETE_MILESTONES } from '../constants/covenantPath';
import { getItem, setItem } from '../utils/storage';
import { useStoredState } from './useStoredState';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

/** One row per convert. `id` is the person's own id — there's only ever one path per person. */
export interface ConvertProgress {
  id: string;
  completed: string[];
}

const EMPTY: ConvertProgress[] = [];

function blankProgress(personId: string): ConvertProgress {
  return { id: personId, completed: [...DEFAULT_COMPLETE_MILESTONES] };
}

/**
 * A convert's path record, or the blank default (nothing checked) for someone
 * who hasn't touched it yet — matching what `useConvertProgress().getProgress`
 * returns, so a screen reading storage directly doesn't have to duplicate it.
 */
export function progressFor(list: ConvertProgress[], personId: string): ConvertProgress {
  return list.find(p => p.id === personId) ?? blankProgress(personId);
}

/**
 * Drop a person's covenant-path record when they're deleted.
 *
 * A plain function rather than part of the hook, same reasoning as
 * detachPersonFromEvents in useCalendarEvents.ts: usePeople is the caller, and
 * mounting this hook there would subscribe every People screen to converts data
 * to do one write.
 */
export async function deleteConvertProgress(personId: string, userId?: string): Promise<void> {
  const list = (await getItem<ConvertProgress[]>(CONVERT_PROGRESS_KEY)) ?? [];
  if (!list.some(p => p.id === personId)) return;
  await setItem(CONVERT_PROGRESS_KEY, list.filter(p => p.id !== personId));
  if (userId) await enqueueDelete('convert_progress', personId, { user_id: userId, id: personId });
}

export function useConvertProgress() {
  const { user } = useAuth();
  const { value: progress, write, reload } = useStoredState<ConvertProgress[]>(CONVERT_PROGRESS_KEY, EMPTY);

  const push = useCallback(async (row: ConvertProgress | undefined) => {
    if (!user || !row) return;
    await enqueueUpsert('convert_progress', row.id, { ...row, user_id: user.id });
  }, [user]);

  const getProgress = useCallback((personId: string) => progressFor(progress, personId), [progress]);

  const toggleMilestone = useCallback(async (personId: string, milestoneId: string) => {
    const updated = await write(current => {
      const existing = current.find(p => p.id === personId);
      const base = existing ?? blankProgress(personId);
      const next: ConvertProgress = {
        ...base,
        completed: base.completed.includes(milestoneId)
          ? base.completed.filter(id => id !== milestoneId)
          : [...base.completed, milestoneId],
      };
      return existing
        ? current.map(p => (p.id === personId ? next : p))
        : [...current, next];
    });
    await push(updated.find(p => p.id === personId));
  }, [write, push]);

  return { progress, getProgress, toggleMilestone, reload };
}
