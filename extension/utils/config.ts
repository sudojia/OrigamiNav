import { storage } from 'wxt/utils/storage';

/** Extension configuration persisted in chrome.storage.local. */

export interface ExtConfig {
  /** Origin base, no trailing slash, e.g. https://nav.example.com */
  serverUrl: string;
  /** Bearer token generated in the admin settings. */
  token: string;
}

export const serverUrlItem = storage.defineItem<string>('local:serverUrl', {
  fallback: '',
});

export const tokenItem = storage.defineItem<string>('local:token', {
  fallback: '',
});

export const lastCategoryItem = storage.defineItem<string | null>(
  'local:lastCategoryId',
  { fallback: null },
);

/** Reads and normalizes both settings; blanks and stray slashes trimmed. */
export async function loadConfig(): Promise<ExtConfig> {
  const [serverUrl, token] = await Promise.all([
    serverUrlItem.getValue(),
    tokenItem.getValue(),
  ]);
  return {
    serverUrl: serverUrl.trim().replace(/\/+$/, ''),
    token: token.trim(),
  };
}

export function isConfigured(config: ExtConfig): boolean {
  return /^https?:\/\//i.test(config.serverUrl) && config.token.length > 0;
}
