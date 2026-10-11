/**
 * Tab-persistent list/alternate view preference for the admin managers, backed
 * by localStorage and cross-tab via the `storage` event.
 */
export function createViewPreference<Alt extends string>(opts: {
  storageKey: string;
  /** Custom event fired after every write, so same-tab listeners refresh. */
  event: string;
  /** The non-list mode stored in localStorage. */
  alt: Alt;
}) {
  type ViewMode = 'list' | Alt;

  function subscribe(onChange: () => void): () => void {
    window.addEventListener(opts.event, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(opts.event, onChange);
      window.removeEventListener('storage', onChange);
    };
  }

  function read(): ViewMode {
    try {
      return localStorage.getItem(opts.storageKey) === opts.alt
        ? opts.alt
        : 'list';
    } catch {
      return 'list';
    }
  }

  // useSyncExternalStore's server snapshot; views render as list until hydration.
  function readOnServer(): ViewMode {
    return 'list';
  }

  function write(next: ViewMode): void {
    try {
      localStorage.setItem(opts.storageKey, next);
    } catch {
      // Storage blocked; applies to this tab only.
    }
    window.dispatchEvent(new Event(opts.event));
  }

  return { subscribe, read, readOnServer, write };
}
