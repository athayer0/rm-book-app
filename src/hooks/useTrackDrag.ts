import { useMemo, useRef } from 'react';
import { LayoutChangeEvent, PanResponder } from 'react-native';

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Turns a plain View into a draggable track. Reports every touch as a 0–1
 * fraction of the view's own box — on press as well as on drag, so tapping a
 * point on a slider jumps to it rather than requiring a swipe.
 *
 * `onEnd` fires once when the finger lifts. Callers use it to commit: dragging
 * emits at frame rate, and every settings write is an AsyncStorage round trip
 * plus a queued upsert, so the persisted value is written on release only.
 */
export function useTrackDrag(onMove: (fx: number, fy: number) => void, onEnd?: () => void) {
  const box = useRef({ w: 1, h: 1 });
  const origin = useRef({ x: 0, y: 0 });

  // PanResponder is built once, so it would otherwise capture the first render's
  // callbacks and keep writing to a stale draft.
  const move = useRef(onMove);
  move.current = onMove;
  const end = useRef(onEnd);
  end.current = onEnd;

  const responder = useMemo(() => {
    const emit = (x: number, y: number) =>
      move.current(clamp01(x / box.current.w), clamp01(y / box.current.h));

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Every one of these tracks lives inside a ScrollView. Without this the
      // scroll reclaims the gesture the moment the finger drifts off-axis.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: e => {
        origin.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        emit(origin.current.x, origin.current.y);
      },
      onPanResponderMove: (_e, g) => emit(origin.current.x + g.dx, origin.current.y + g.dy),
      onPanResponderRelease: () => end.current?.(),
      // A terminated gesture still moved the draft, so it commits like a release.
      onPanResponderTerminate: () => end.current?.(),
    });
  }, []);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    box.current = { w: width || 1, h: height || 1 };
  }

  return { panHandlers: responder.panHandlers, onLayout };
}
