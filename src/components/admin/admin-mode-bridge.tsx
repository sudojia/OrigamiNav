'use client';

import { useLayoutEffect } from 'react';

import { useAdminMode } from './admin-mode';

/**
 * Mirrors the admin's mode onto <body>. Portaled surfaces (selects, popovers,
 * tooltips, dialogs) mount on the body, outside .admin-shell, so they would
 * otherwise inherit the public site's mode from <html>.
 */
export function AdminModeBridge({ darkOnly = false }: { darkOnly?: boolean }) {
  const mode = useAdminMode();
  const effective = darkOnly ? 'dark' : mode;

  useLayoutEffect(() => {
    const { classList } = document.body;
    classList.add(effective);
    // Leaving /admin drops the override; the public pages use <html> again.
    return () => classList.remove('dark', 'light');
  }, [effective]);

  return null;
}
