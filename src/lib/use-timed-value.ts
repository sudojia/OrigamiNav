'use client';

import { useEffect, useRef, useState } from 'react';

/** State that auto-resets to null `delayMs` after each arm — one-shot
 * confirm/copy affordances that must not latch. `arm` restarts the timer;
 * `clear` resets it now. */
export function useTimedValue<T>(
  delayMs: number,
): [T | null, (value: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue(null);
  };

  const arm = (next: T) => {
    if (timer.current) clearTimeout(timer.current);
    setValue(next);
    timer.current = setTimeout(() => setValue(null), delayMs);
  };

  return [value, arm, clear];
}
