import { useRef } from 'react';

export function useLongPress(onLong, ms = 550) {
  const timer = useRef(null);
  const fired = useRef(false);
  const clear = () => clearTimeout(timer.current);
  return {
    handlers: {
      onPointerDown: () => {
        fired.current = false;
        timer.current = setTimeout(() => { fired.current = true; onLong(); }, ms);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e) => e.preventDefault(),
    },
    wasLong: () => fired.current,
  };
}
