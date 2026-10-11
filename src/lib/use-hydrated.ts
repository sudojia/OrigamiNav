import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** True once React has hydrated on the client; false during SSR. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
