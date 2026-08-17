import React, { createContext, useContext, useState } from 'react';
import { CalendarEvent } from '../utils/eventUtils';

type DragState = {
  event: CalendarEvent | null;
  ghostX: number;
  ghostY: number;
  ghostWidth: number;
  ghostHeight: number;
  // How far below the block's top edge the finger pressed. Captured once at
  // gesture start and held for the drag, so the block keeps the grip it was
  // picked up with instead of snapping its top to the finger.
  grabOffsetY: number;
  active: boolean;
  // Every event id being carried by this drag — the grabbed block plus the rest
  // of a multi-selection, when there is one. `null` for an ordinary single-event
  // drag. EventBlock uses this (not just `event`) to decide whether to hide
  // itself, so the whole selection lifts off the grid together rather than just
  // the block that was actually grabbed.
  groupIds: Set<string> | null;
};

type DragContextValue = DragState & {
  startDrag: (event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffsetY: number, groupIds?: string[]) => void;
  moveDrag: (x: number, y: number) => void;
  endDrag: () => void;
};

const IDLE: DragState = {
  event: null, ghostX: 0, ghostY: 0, ghostWidth: 0, ghostHeight: 0, grabOffsetY: 0, active: false, groupIds: null,
};

const DragContext = createContext<DragContextValue>({
  ...IDLE,
  startDrag: () => {}, moveDrag: () => {}, endDrag: () => {},
});

export function DragProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DragState>(IDLE);

  function startDrag(event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffsetY: number, groupIds?: string[]) {
    setState({ event, ghostX: x, ghostY: y, ghostWidth: width, ghostHeight: height, grabOffsetY, active: true, groupIds: groupIds ? new Set(groupIds) : null });
  }

  function moveDrag(x: number, y: number) {
    setState(s => ({ ...s, ghostX: x, ghostY: y }));
  }

  function endDrag() {
    setState(IDLE);
  }

  return (
    <DragContext.Provider value={{ ...state, startDrag, moveDrag, endDrag }}>
      {children}
    </DragContext.Provider>
  );
}

export function useDrag() {
  return useContext(DragContext);
}
