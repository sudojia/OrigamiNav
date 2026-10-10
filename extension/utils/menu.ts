import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

import { fetchContext } from './api';
import { isConfigured, loadConfig } from './config';

/** Right-click menu: a root item whose children are the site's categories. */

const MENU_ROOT_ID = 'save';
const MENU_ITEM_PREFIX = 'save:';
/** Child that opens the options page while no site is connected. */
export const MENU_SETUP_ID = 'save:setup';
/** Child shown when the connected site has no categories yet. */
const MENU_EMPTY_ID = 'save:empty';

export interface MenuCategory {
  id: string;
  name: string;
}

/** Category list the menu renders from; null until a site is connected. */
export const menuCategoriesItem = storage.defineItem<MenuCategory[] | null>(
  'local:menuCategories',
  { fallback: null },
);

/** Category id encoded in a child item; null for the root and placeholder items. */
export function categoryIdOf(menuItemId: string | number): string | null {
  const id = String(menuItemId);
  return id.startsWith(MENU_ITEM_PREFIX) &&
    id !== MENU_SETUP_ID &&
    id !== MENU_EMPTY_ID
    ? id.slice(MENU_ITEM_PREFIX.length)
    : null;
}

/** Publishes a list the caller already has; the service worker re-renders the menu. */
export async function publishMenuCategories(
  categories: MenuCategory[] | null,
): Promise<void> {
  // Writing an identical list would still wake the service worker to rebuild.
  if (sameCategories(await menuCategoriesItem.getValue(), categories)) return;
  await menuCategoriesItem.setValue(categories);
}

function sameCategories(
  left: MenuCategory[] | null,
  right: MenuCategory[] | null,
): boolean {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) return false;
    if (left[index]?.name !== right[index]?.name) return false;
  }
  return true;
}

/** Pulls the list from the site; used on install, browser start and config changes. */
export async function refreshMenuCategories(): Promise<void> {
  const config = await loadConfig();
  if (!isConfigured(config)) {
    await publishMenuCategories(null);
    return;
  }
  try {
    // The site origin stands in for the URL that context's duplicate check needs.
    const context = await fetchContext(config, config.serverUrl);
    await publishMenuCategories(
      context.categories.map(({ id, name }) => ({ id, name })),
    );
  } catch {
    // Offline or bad token: keep the cached list, the save path reports failures.
  }
}

/** Rebuilds the menu from a list; only the service worker owns the menu. */
export function renderMenu(categories: MenuCategory[] | null): void {
  // Serialized: two overlapping rebuilds would interleave `removeAll` and
  // `create` and leave the menu half-built.
  renderQueue = renderQueue
    .catch(() => undefined)
    .then(() => rebuildMenu(categories))
    .catch((error) => console.error('[OrigamiNav] menu render failed', error));
}

let renderQueue: Promise<void> = Promise.resolve();

async function rebuildMenu(
  categories: MenuCategory[] | null,
): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: MENU_ROOT_ID,
    title: '收藏到 OrigamiNav',
    contexts: ['page', 'frame'],
  });

  if (categories === null) {
    browser.contextMenus.create({
      id: MENU_SETUP_ID,
      parentId: MENU_ROOT_ID,
      title: '打开扩展设置…',
      contexts: ['page', 'frame'],
    });
    return;
  }
  if (categories.length === 0) {
    browser.contextMenus.create({
      id: MENU_EMPTY_ID,
      parentId: MENU_ROOT_ID,
      title: '站点还没有分类，请先在后台创建',
      contexts: ['page', 'frame'],
      enabled: false,
    });
    return;
  }

  for (const category of categories) {
    browser.contextMenus.create({
      id: `${MENU_ITEM_PREFIX}${category.id}`,
      parentId: MENU_ROOT_ID,
      title: category.name,
      contexts: ['page', 'frame'],
    });
  }
}
