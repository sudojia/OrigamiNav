import { browser } from 'wxt/browser';

/** Active-tab detection and page-meta extraction for the popup. */

export interface PageMeta {
  url: string;
  title: string;
  favIconUrl: string | null;
  description: string;
}

function isSupportedUrl(url: string): boolean {
  // Only http(s) pages can be bookmarked.
  return /^https?:\/\//i.test(url);
}

/** Active tab info + meta description (activeTab executeScript); null when
 * the page is not bookmarkable. */
export async function getActivePageMeta(): Promise<PageMeta | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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

/** Runs in the page; must stay self-contained. */
function extractDescription(): string {
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="description"], meta[property="og:description"]',
  );
  for (const meta of metas) {
    const content = meta.getAttribute('content')?.trim();
    if (content) return content.slice(0, 300);
  }
  return '';
}
