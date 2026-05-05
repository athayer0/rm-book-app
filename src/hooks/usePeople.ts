import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { generateId } from '../utils/eventUtils';

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
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    getItem<Person[]>('people').then(stored => {
      if (stored) setPeople(stored);
    });
  }, []);

  const addPerson = useCallback(async (person: Omit<Person, 'id' | 'createdAt'>) => {
    const newPerson: Person = {
      ...person,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...people, newPerson];
    setPeople(updated);
    await setItem('people', updated);
    return newPerson;
  }, [people]);

  const updatePerson = useCallback(async (id: string, changes: Partial<Person>) => {
    const updated = people.map(p => p.id === id ? { ...p, ...changes } : p);
    setPeople(updated);
    await setItem('people', updated);
  }, [people]);

  const deletePerson = useCallback(async (id: string) => {
    const updated = people.filter(p => p.id !== id);
    setPeople(updated);
    await setItem('people', updated);
  }, [people]);

  const toggleStar = useCallback(async (id: string) => {
    const updated = people.map(p => p.id === id ? { ...p, starred: !p.starred } : p);
    setPeople(updated);
    await setItem('people', updated);
  }, [people]);

  return { people, addPerson, updatePerson, deletePerson, toggleStar };
}
