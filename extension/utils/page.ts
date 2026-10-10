import { browser } from 'wxt/browser';

import { DESCRIPTION_LIMIT } from './limits';

/** Tab detection and page-meta extraction, shared by the popup and the context menu. */

export interface PageMeta {
  url: string;
  title: string;
  favIconUrl: string | null;
  description: string;
}

/** Tab fields this module reads; satisfied by both `tabs.query` results and the
 * tab a context-menu click reports. */
export interface TabLike {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

function isSupportedUrl(url: string): boolean {
  // Only http(s) pages can be bookmarked.
  return /^https?:\/\//i.test(url);
}

/** Page meta for one tab; null when the tab cannot be bookmarked. */
export async function readTabMeta(
  tab: TabLike | undefined,
): Promise<PageMeta | null> {
  if (!tab?.url || !isSupportedUrl(tab.url)) return null;

  const meta: PageMeta = {
    url: tab.url,
    title: tab.title?.trim() || tab.url,
    favIconUrl:
      tab.favIconUrl && isSupportedUrl(tab.favIconUrl) ? tab.favIconUrl : null,
    description: '',
  };

  if (tab.id !== undefined) {
    try {
      const [injection] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractDescription,
        // Injected functions are serialized, so the cap travels as an argument.
        args: [DESCRIPTION_LIMIT],
      });
      if (injection && typeof injection.result === 'string') {
        meta.description = injection.result;
      }
    } catch {
      // Restricted page; leave description empty.
    }
  }
  return meta;
}

/** Active tab info + meta description (activeTab executeScript); null when
 * the page is not bookmarkable. */
export async function getActivePageMeta(): Promise<PageMeta | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return readTabMeta(tab);
}

/** Runs in the page; must stay self-contained. */
function extractDescription(limit: number): string {
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="description"], meta[property="og:description"]',
  );
  for (const meta of metas) {
    const content = meta.getAttribute('content')?.trim();
    if (content) return content.slice(0, limit);
  }
  return '';
}
