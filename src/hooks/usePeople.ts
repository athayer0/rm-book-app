import { useCallback } from 'react';
import { generateId } from '../utils/eventUtils';
import { PEOPLE_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';
import { detachPersonFromEvents } from './useCalendarEvents';
import { deleteConvertProgress } from './useConvertProgress';

export interface Person {
  id: string;
  name: string;
  status: string;
  /**
   * Only asked for where it matters — whether Aaronic/Melchizedek Priesthood
   * ordination belong on a recent convert's covenant path. See
   * PersonCovenantPathTab, which prompts for it the first time that tab opens
   * on someone who doesn't have it set yet.
   */
  gender?: 'male' | 'female';
  phone?: string;
  // The optional contact methods the editor adds and removes. `undefined` means
  // the person has no such section at all; a string — including '' — means the
  // section exists and is simply empty. Removing a section writes `undefined`,
  // which toRow turns into a null column, so the removal syncs.
  /** WhatsApp number, seeded from `phone` when added but edited independently. */
  whatsapp?: string;
  /** Whatever identifies the Facebook profile — see toMessengerHandle(). */
  messenger?: string;
  /** Free text, handed to the maps app as typed — see toMapQuery(). */
  address?: string;
  notes?: string;
  starred: boolean;
  createdAt: string;
}

const EMPTY: Person[] = [];

export function usePeople() {
  const { user } = useAuth();
  const { value: people, write, reload } = useStoredState<Person[]>(PEOPLE_KEY, EMPTY);

  const push = useCallback(
    async (row: Person | undefined) => {
      if (!user || !row) return;
      await enqueueUpsert('people', row.id, { ...row, user_id: user.id });
    },
    [user],
  );

  const addPerson = useCallback(async (person: Omit<Person, 'id' | 'createdAt'>) => {
    const newPerson: Person = {
      ...person,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    await write(current => [...current, newPerson]);
    await push(newPerson);
    return newPerson;
  }, [write, push]);

  const updatePerson = useCallback(async (id: string, changes: Partial<Person>) => {
    const updated = await write(current => current.map(p => p.id === id ? { ...p, ...changes } : p));
    await push(updated.find(p => p.id === id));
  }, [write, push]);

  const deletePerson = useCallback(async (id: string) => {
    await write(current => current.filter(p => p.id !== id));
    if (user) await enqueueDelete('people', id, { user_id: user.id, id });
    // The events they were on outlive them, so the id has to come off those too.
    await detachPersonFromEvents(id, user?.id);
    await deleteConvertProgress(id, user?.id);
  }, [write, user]);

  const toggleStar = useCallback(async (id: string) => {
    const updated = await write(current => current.map(p => p.id === id ? { ...p, starred: !p.starred } : p));
    await push(updated.find(p => p.id === id));
  }, [write, push]);

  return { people, addPerson, updatePerson, deletePerson, toggleStar, reload };
}
