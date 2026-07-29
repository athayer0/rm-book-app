import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, setItem, subscribe } from '../utils/storage';

/**
 * State backed by one AsyncStorage key, kept in step with every other holder of
 * that key — including `pullAll`, which writes storage directly.
 *
 * The ref matters: the four hooks this replaces all closed over their state in
 * the write callback, so two writes issued in the same tick lost one of them.
 * Writes here resolve against the ref, which is current even mid-tick.
 */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const [loaded, setLoaded] = useState(false);

  const adopt = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);

  useEffect(() => {
    let live = true;
    getItem<T>(key).then(stored => {
      if (!live) return;
      if (stored !== null) adopt(stored);
      setLoaded(true);
    });

    // Adopting a value from storage must never write back — that would turn a
    // pull into a push and echo the value we just received.
    const unsubscribe = subscribe(key, next => {
      if (!live) return;
      adopt((next ?? initial) as T);
    });

    return () => {
      live = false;
      unsubscribe();
    };
    // `initial` is only read on the delete path; re-subscribing on a new object
    // identity every render would thrash the listener set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, adopt]);

  /** Apply an update to the freshest value and persist it. */
  const write = useCallback(
    async (update: (current: T) => T): Promise<T> => {
      const next = update(ref.current);
      adopt(next);
      await setItem(key, next);
      return next;
    },
    [key, adopt],
  );

  const reload = useCallback(async () => {
    const stored = await getItem<T>(key);
    if (stored !== null) adopt(stored);
  }, [key, adopt]);

  return { value, current: ref, write, reload, loaded };
}
