import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { ApiError, createBookmark } from '@/utils/api';
import {
  isConfigured,
  lastCategoryItem,
  loadConfig,
  serverUrlItem,
  tokenItem,
} from '@/utils/config';
import { TITLE_LIMIT } from '@/utils/limits';
import {
  MENU_SETUP_ID,
  categoryIdOf,
  menuCategoriesItem,
  publishMenuCategories,
  refreshMenuCategories,
  renderMenu,
} from '@/utils/menu';
import { readTabMeta, type TabLike } from '@/utils/page';

/** Right-click "收藏到 OrigamiNav": the submenu picks the category, the page is
 * saved without opening the popup, and the toolbar badge reports the outcome. */

/** How long a result badge stays up before the icon goes back to normal. */
const BADGE_MS = 3000;
const BADGE_COLORS = {
  ok: '#16a34a',
  warn: '#f59e0b',
  error: '#dc2626',
} as const;

export default defineBackground(() => {
  // The popup and the options page publish the category list; this worker owns
  // the menu, so every rebuild goes through one place.
  menuCategoriesItem.watch((categories) => renderMenu(categories));
  // Reconnecting or switching sites replaces the whole submenu.
  serverUrlItem.watch(() => void refreshMenuCategories());
  tokenItem.watch(() => void refreshMenuCategories());

  // Menus persist in the browser profile, so the cached list is enough to
  // rebuild on install or update; the fetch then refreshes the children.
  browser.runtime.onInstalled.addListener(async () => {
    renderMenu(await menuCategoriesItem.getValue());
    await refreshMenuCategories();
  });
  browser.runtime.onStartup.addListener(() => void refreshMenuCategories());

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_SETUP_ID) {
      await browser.runtime.openOptionsPage();
      return;
    }
    const categoryId = categoryIdOf(info.menuItemId);
    if (categoryId) await savePage(tab, categoryId);
  });
});

async function savePage(
  tab: TabLike | undefined,
  categoryId: string,
): Promise<void> {
  const tabId = tab?.id;
  if (tabId === undefined) return;

  try {
    const [meta, config] = await Promise.all([readTabMeta(tab), loadConfig()]);

    if (!meta) {
      await showBadge(tabId, '!', BADGE_COLORS.error, '此页面无法收藏');
      return;
    }
    if (!isConfigured(config)) {
      // Token revoked or settings wiped since the menu was built.
      await browser.runtime.openOptionsPage();
      return;
    }

    await createBookmark(config, {
      title: meta.title.slice(0, TITLE_LIMIT),
      url: meta.url,
      description: meta.description,
      iconUrl: meta.favIconUrl,
      categoryId,
    });
    // Keeps the popup's default category in step with the menu pick.
    await lastCategoryItem.setValue(categoryId);

    const name = (await menuCategoriesItem.getValue())?.find(
      (category) => category.id === categoryId,
    )?.name;
    await showBadge(
      tabId,
      '✓',
      BADGE_COLORS.ok,
      name ? `已收藏到「${name}」` : '已收藏',
    );
  } catch (error) {
    if (error instanceof ApiError && error.failure.kind === 'duplicate') {
      await showBadge(
        tabId,
        '!',
        BADGE_COLORS.warn,
        `已收藏于「${error.failure.existing.categoryName}」`,
      );
      return;
    }
    if (!(error instanceof ApiError)) {
      console.error('[OrigamiNav] save failed', error);
    }
    // A category deleted in the admin is the likely cause: refresh the list so
    // the next right-click offers the live one.
    await refreshMenuCategories();
    await showBadge(
      tabId,
      '!',
      BADGE_COLORS.error,
      error instanceof ApiError ? error.failure.message : '保存失败，请重试',
    );
  }
}

const clearTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** Badge and tooltip for the saved tab only; a later result replaces both. */
async function showBadge(
  tabId: number,
  text: string,
  color: string,
  title: string,
): Promise<void> {
  await Promise.all([
    browser.action.setBadgeText({ text, tabId }),
    browser.action.setBadgeBackgroundColor({ color, tabId }),
    browser.action.setTitle({ title, tabId }),
  ]);

  clearTimeout(clearTimers.get(tabId));
  clearTimers.set(
    tabId,
    setTimeout(() => {
      clearTimers.delete(tabId);
      void browser.action.setBadgeText({ text: '', tabId });
      void browser.action.setTitle({ title: '', tabId });
    }, BADGE_MS),
  );
}
