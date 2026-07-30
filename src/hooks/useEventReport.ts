import { useCallback } from 'react';
import { CalendarEvent, EventStatus } from '../utils/eventUtils';
import { statusAfterCompletedDate } from '../constants/personStatuses';
import { useEventStatuses } from './useEventStatuses';
import { usePeople } from './usePeople';

/**
 * Recording a report, plus everything that follows from it.
 *
 * Every route to a reported status goes through here — the calendar's checkbox, the
 * event editor's picker, the unreported backlog, a person's timeline — so what a
 * report implies can't depend on which screen it was made from.
 *
 * Goal counts are not among those implications: they are derived from statuses
 * rather than accumulated, so the occurrence's week picks its contribution up
 * unprompted, and gives it back if the event is later moved, retyped, or deleted.
 *
 * What does follow is dating progress. Reporting a date as completed graduates
 * whoever it was with out of 'Potential Dates'.
 */
export function useEventReport() {
  const { getStatus, setStatus } = useEventStatuses();
  const { people, updatePerson } = usePeople();

  const report = useCallback(
    async (occurrence: CalendarEvent, status: EventStatus | undefined) => {
      await setStatus(occurrence.id, occurrence.date, status);

      if (status !== 'completed' || occurrence.type !== 'date') return;

      // Forward only. Clearing the report later can't demote anyone: the date still
      // happened, and the status may have been moved on by hand since.
      for (const personId of occurrence.people ?? []) {
        const person = people.find(p => p.id === personId);
        if (!person) continue;
        const promoted = statusAfterCompletedDate(person.status);
        if (promoted) await updatePerson(personId, { status: promoted });
      }
    },
    [setStatus, people, updatePerson],
  );

  return { getStatus, report };
}
