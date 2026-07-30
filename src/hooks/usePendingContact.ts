import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { format } from 'date-fns';
import { formatTime } from '../utils/dateUtils';

export interface PendingContact {
  /** A key of CONTACT_METHODS — whichever button sent the user out of the app. */
  method: string;
  /** yyyy-MM-dd of the moment the button was tapped. */
  date: string;
  /** "2:14 PM" — when the contact started, not when the user came back. */
  startTime: string;
}

/**
 * Turns "left the app to call someone, then came back" into a contact to log.
 *
 * Lives beside the buttons that trigger it rather than in a global store: the
 * only way to start one is from an open person editor, so the editor already
 * knows who it is for, and two editors mounted at once (Home keeps its copy
 * alive behind the People tab) can't both answer for the same tap.
 *
 * The attempt is only held in memory. If the OS kills the app mid-call there is
 * nothing to come back to — which is the honest outcome, since a resurrected
 * intent would be offering to log a call the user may not remember making.
 */
export function usePendingContact() {
  const pending = useRef<PendingContact | null>(null);
  const leftApp = useRef(false);
  const [captured, setCaptured] = useState<PendingContact | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (!pending.current) return;
      // 'background' rather than 'inactive'. iOS goes inactive for a notification
      // banner, a control-centre swipe, and — the case that matters — the "Call
      // 555…?" confirmation. Waiting for a real backgrounding means declining
      // that prompt leaves nothing behind to log.
      if (state === 'background') {
        leftApp.current = true;
        return;
      }
      if (state !== 'active') return;
      // Back in the foreground, so this attempt is settled either way. Coming
      // back without having left means the contact never happened — declining
      // iOS's "Call 555…?" prompt returns straight to active — and the intent
      // has to be dropped rather than left armed, or the next unrelated app
      // switch would surface a draft for a call from hours ago.
      if (leftApp.current) setCaptured(pending.current);
      pending.current = null;
      leftApp.current = false;
    });
    return () => sub.remove();
  }, []);

  const noteAttempt = useCallback((method: string) => {
    const now = new Date();
    pending.current = {
      method,
      date: format(now, 'yyyy-MM-dd'),
      startTime: formatTime(now.getHours(), now.getMinutes()),
    };
    leftApp.current = false;
  }, []);

  /** Drop the captured attempt — whether it was saved as an event or dismissed. */
  const clearCaptured = useCallback(() => setCaptured(null), []);

  return { noteAttempt, captured, clearCaptured };
}
