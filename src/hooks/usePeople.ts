import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { generateId } from '../utils/eventUtils';
import { enqueue } from '../lib/syncQueue';
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

export function usePeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);

  const reload = useCallback(async () => {
    const stored = await getItem<Person[]>('people');
    if (stored) setPeople(stored);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addPerson = useCallback(async (person: Omit<Person, 'id' | 'createdAt'>) => {
    const newPerson: Person = {
      ...person,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...people, newPerson];
    setPeople(updated);
    await setItem('people', updated);
    if (user) await enqueue({ table: 'people', type: 'upsert', row: { ...newPerson, user_id: user.id, updated_at: new Date().toISOString() } });
    return newPerson;
  }, [people, user]);

  const updatePerson = useCallback(async (id: string, changes: Partial<Person>) => {
    const updated = people.map(p => p.id === id ? { ...p, ...changes } : p);
    setPeople(updated);
    await setItem('people', updated);
    const row = updated.find(p => p.id === id);
    if (user && row) await enqueue({ table: 'people', type: 'upsert', row: { ...row, user_id: user.id, updated_at: new Date().toISOString() } });
  }, [people, user]);

  const deletePerson = useCallback(async (id: string) => {
    const updated = people.filter(p => p.id !== id);
    setPeople(updated);
    await setItem('people', updated);
    if (user) await enqueue({ table: 'people', type: 'delete', row: { id, user_id: user.id } });
  }, [people, user]);

  const toggleStar = useCallback(async (id: string) => {
    const updated = people.map(p => p.id === id ? { ...p, starred: !p.starred } : p);
    setPeople(updated);
    await setItem('people', updated);
    const row = updated.find(p => p.id === id);
    if (user && row) await enqueue({ table: 'people', type: 'upsert', row: { ...row, user_id: user.id, updated_at: new Date().toISOString() } });
  }, [people, user]);

  return { people, addPerson, updatePerson, deletePerson, toggleStar, reload };
}
