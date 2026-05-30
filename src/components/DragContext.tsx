import React, { createContext, useContext, useRef, useState } from 'react';
import { CalendarEvent } from '../utils/eventUtils';

type DragState = {
  event: CalendarEvent | null;
  ghostX: number;
  ghostY: number;
  ghostWidth: number;
  ghostHeight: number;
  active: boolean;
};

type DragContextValue = DragState & {
  startDrag: (event: CalendarEvent, x: number, y: number, width: number, height: number) => void;
  moveDrag: (x: number, y: number) => void;
  endDrag: () => void;
};

const DragContext = createContext<DragContextValue>({
  event: null, ghostX: 0, ghostY: 0, ghostWidth: 0, ghostHeight: 0, active: false,
  startDrag: () => {}, moveDrag: () => {}, endDrag: () => {},
});

export function DragProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DragState>({ event: null, ghostX: 0, ghostY: 0, ghostWidth: 0, ghostHeight: 0, active: false });

  function startDrag(event: CalendarEvent, x: number, y: number, width: number, height: number) {
    setState({ event, ghostX: x, ghostY: y, ghostWidth: width, ghostHeight: height, active: true });
  }

  function moveDrag(x: number, y: number) {
    setState(s => ({ ...s, ghostX: x, ghostY: y }));
  }

  function endDrag() {
    setState({ event: null, ghostX: 0, ghostY: 0, ghostWidth: 0, ghostHeight: 0, active: false });
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
