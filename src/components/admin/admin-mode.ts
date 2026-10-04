import { useSyncExternalStore } from 'react';

/** Storage key for the admin's own light/dark mode. */
export const ADMIN_MODE_STORAGE_KEY = 'origaminav.admin-mode';
export const ADMIN_MODE_EVENT = 'origaminav:admin-mode';

export function readAdminMode(): 'dark' | 'light' {
  try {
    return localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === 'light'
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
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

/** Reads the admin's own light/dark mode. Defaults to dark. */
export function useAdminMode(): 'dark' | 'light' {
  return useSyncExternalStore(
    subscribeToAdminMode,
    readAdminMode,
    () => 'dark' as const,
  );
}

function subscribeToNothing(): () => void {
  return () => {};
}

/** Mode class for a dialog portal, or undefined outside the backend. */
export function useAdminDialogMode(): 'dark' | 'light' | undefined {
  const inAdmin = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(document.querySelector('.admin-shell')),
    () => false,
  );
  const mode = useAdminMode();
  return inAdmin ? mode : undefined;
}
