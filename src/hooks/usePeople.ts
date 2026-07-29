import { useCallback } from 'react';
import { generateId } from '../utils/eventUtils';
import { PEOPLE_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export interface Person {
  id: string;
  name: string;
  status: string;
  phone?: string;
  notes?: string;
  photoUri?: string;
  starred: boolean;
  createdAt: string;
  lastInteraction?: string;
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
  }, [write, user]);

  const toggleStar = useCallback(async (id: string) => {
    const updated = await write(current => current.map(p => p.id === id ? { ...p, starred: !p.starred } : p));
    await push(updated.find(p => p.id === id));
  }, [write, push]);

  return { people, addPerson, updatePerson, deletePerson, toggleStar, reload };
}
