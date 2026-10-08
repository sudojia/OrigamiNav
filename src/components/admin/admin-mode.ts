import { useSyncExternalStore } from 'react';

/** Storage key for the admin's own light/dark mode. */
export const ADMIN_MODE_STORAGE_KEY = 'origaminav.admin-mode';
export const ADMIN_MODE_EVENT = 'origaminav:admin-mode';

function readAdminMode(): 'dark' | 'light' {
  try {
    return localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === 'dark'
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

function subscribeToAdminMode(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(ADMIN_MODE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(ADMIN_MODE_EVENT, onChange);
  };
}

/** Reads the admin's own light/dark mode. Defaults to light. */
export function useAdminMode(): 'dark' | 'light' {
  return useSyncExternalStore(
    subscribeToAdminMode,
    readAdminMode,
    () => 'light' as const,
  );
}
