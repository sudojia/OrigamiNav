'use server';

import { z } from 'zod';

import { guardAction, guardAction as guard } from '@/lib/action-guard';
import { fetchUrlMetas, type FetchMetaResult } from '@/lib/fetch-meta';
import { BusinessError, userMessage } from '@/lib/errors';
import {
  createBookmarksBulk,
  getExistingBookmarkUrls,
  type BulkBookmarkInput,
} from '@/db/queries/bookmarks';
import {
  getCategoriesByIds,
  resolveOrCreateCategories,
} from '@/db/queries/categories';
import { mapTagNamesToIds } from '@/db/queries/tags';
import { replaceAllData, type ExportCategory } from '@/db/queries/transfer';
import { analyzePastedUrls } from '@/lib/bookmark-import';
import { revalidateSite } from '@/lib/revalidate';
import { httpUrlSchema, LIMITS, MAX_URL_LINES } from '@/lib/validation';
import { hostnameOf, isValidHttpUrl } from '@/lib/utils';

import type { ActionState } from '@/types/action';

/** Import actions: pasted URLs, Netscape HTML, and JSON backup restore. */

const MAX_FILE_BYTES = 2 * 1024 * 1024; // matches serverActions.bodySizeLimit
const MAX_HTML_BOOKMARKS = 5_000;
const MAX_JSON_BOOKMARKS = 20_000;
/** Max URLs that fetch metadata during an import. */
const MAX_META_FETCH = 30;

/** Creates missing tags and returns a name → id map. */
async function tagLookup(names: string[][]): Promise<Map<string, string>> {
  const unique = [...new Set(names.flat().map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  return mapTagNamesToIds(unique);
}

function idsFor(names: string[], byName: Map<string, string>): string[] {
  return names
    .map((n) => byName.get(n.trim()))
    .filter((id): id is string => Boolean(id));
}

// ── 1. Bulk URLs ─────────────────────────────────────────────────────────────

export type UrlPreviewItem = {
  url: string;
  title: string;
  description: string;
  iconUrl: string | null;
  /** True when title/description came from a successful metadata fetch. */
  fetched: boolean;
};

export type UrlPreviewResult =
  | {
      ok: true;
      items: UrlPreviewItem[];
      /** Rows dropped because their URL is already bookmarked. */
      skippedExisting: number;
      fetchedCount: number;
      fetchEnabled: boolean;
    }
  | { ok: false; message: string };

const urlPreviewInputSchema = z.object({
  urlsText: z.string().max(1_000_000),
  fetchMeta: z.boolean(),
});

/** Parses pasted URLs, drops already-bookmarked ones, and fetches metadata for
 * the first batch so the client can preview and edit before committing. */
export async function previewUrlImportAction(input: {
  urlsText: string;
  fetchMeta: boolean;
}): Promise<UrlPreviewResult> {
  const denied = await guard();
  if (denied) return { ok: false, message: denied.message };

  const parsed = urlPreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: '链接内容无效' };
  }

  const parsedItems = analyzePastedUrls(parsed.data.urlsText).items;
  if (parsedItems.length === 0) {
    return { ok: false, message: '没有解析到有效的 http(s):// 链接，每行一个' };
  }
  if (parsedItems.length > MAX_URL_LINES) {
    return {
      ok: false,
      message: `一次最多导入 ${MAX_URL_LINES} 条链接（当前 ${parsedItems.length} 条）`,
    };
  }

  try {
    const existing = await getExistingBookmarkUrls(parsedItems.map((p) => p.url));
    const fresh = parsedItems.filter((p) => !existing.has(p.url));
    const skippedExisting = parsedItems.length - fresh.length;
    if (fresh.length === 0) {
      return { ok: false, message: `全部 ${parsedItems.length} 条链接都已存在，无需导入` };
    }

    // Fetches metadata for the first MAX_META_FETCH titleless URLs in
    // parallel; a failed fetch falls back to the hostname title.
    const metaByIndex = new Map<number, FetchMetaResult>();
    if (parsed.data.fetchMeta) {
      const targets = fresh
        .slice(0, MAX_META_FETCH)
        .map((item, index) => (item.title ? null : index))
        .filter((index): index is number => index !== null);
      const results = await fetchUrlMetas(
        targets.map((index) => fresh[index]!.url),
      );
      for (const [slot, index] of targets.entries()) {
        metaByIndex.set(index, results[slot]!);
      }
    }

    const items: UrlPreviewItem[] = fresh.map((item, index) => {
      const meta = metaByIndex.get(index);
      if (meta?.ok) {
        return {
          url: item.url,
          title: meta.title,
          description: meta.description,
          iconUrl: meta.iconUrl,
          fetched: true,
        };
      }
      return {
        url: item.url,
        title: item.title || hostnameOf(item.url) || item.url,
        description: '',
        iconUrl: null,
        fetched: false,
      };
    });

    return {
      ok: true,
      items,
      skippedExisting,
      fetchedCount: items.filter((item) => item.fetched).length,
      fetchEnabled: parsed.data.fetchMeta,
    };
  } catch (error) {
    return { ok: false, message: userMessage(error, '解析失败，请检查文件内容') };
  }
}

export type UrlImportResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; message: string };

const urlImportItemSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.url)
    .pipe(httpUrlSchema('URL 无效')),
  title: z.string().trim().min(1, '标题不能为空').max(LIMITS.title),
  description: z.string().max(LIMITS.description).default(''),
  iconUrl: z
    .string()
    .max(LIMITS.url)
    .nullish()
    .refine((v) => !v || isValidHttpUrl(v), '图标地址无效'),
});

const urlImportSchema = z.object({
  categoryId: z.string().min(1),
  items: z
    .array(urlImportItemSchema)
    .min(1, '没有可导入的链接')
    .max(MAX_URL_LINES),
});

/** Imports the previewed selection; metadata was already fetched at preview. */
export async function confirmUrlImportAction(input: {
  categoryId: string;
  items: Array<{
    url: string;
    title: string;
    description: string;
    iconUrl: string | null;
  }>;
}): Promise<UrlImportResult> {
  const denied = await guard();
  if (denied) return { ok: false, message: denied.message };

  const parsed = urlImportSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `导入数据无效：${issue?.message ?? '未知错误'}` };
  }
  const { categoryId, items } = parsed.data;

  try {
    const existing = await getExistingBookmarkUrls(items.map((item) => item.url));
    const inputs: BulkBookmarkInput[] = [];
    let skipped = 0;
    for (const item of items) {
      if (existing.has(item.url)) {
        skipped += 1;
        continue;
      }
      // De-dupes within the payload.
      existing.add(item.url);
      inputs.push({
        categoryId,
        title: item.title,
        url: item.url,
        description: item.description,
        iconUrl: item.iconUrl ?? null,
        tagIds: [],
        tagNames: [],
      });
    }

    const created = await createBookmarksBulk(inputs);
    revalidateSite();
    return { ok: true, created, skipped };
  } catch (error) {
    return { ok: false, message: userMessage(error, '导入失败，请重试') };
  }
}

// ── 2. Netscape HTML — parsed and mapped by the client wizard ────────────────

export type MappedImportItem = {
  folderKey: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  createdAt: string | null;
  tags: string[];
  /** Per-bookmark category override; takes precedence over the folder mapping. */
  categoryId: string | null;
  newCategoryName: string | null;
};

/** Destination for a source folder: an existing category or a new one. */
export type FolderMapping =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; name: string };

export type ImportMappedResult =
  | { ok: true; created: number; skipped: number; categories: number }
  | { ok: false; message: string };

const mappedItemSchema = z.object({
  folderKey: z.string().max(200),
  title: z.string().trim().min(1, '书签标题不能为空').max(LIMITS.title),
  url: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.url)
    .pipe(httpUrlSchema('URL 无效')),
  description: z.string().max(LIMITS.description).default(''),
  iconUrl: z
    .string()
    .max(LIMITS.url)
    .nullish()
    .refine((v) => !v || isValidHttpUrl(v), '图标地址无效'),
  createdAt: z.string().nullish(),
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.tagName))
    .max(LIMITS.tagsPerBookmark)
    .default([]),
  categoryId: z.string().max(64).nullish(),
  newCategoryName: z.string().trim().min(1).max(LIMITS.categoryName).nullish(),
});

const folderMappingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), categoryId: z.string().min(1) }),
  z.object({
    kind: z.literal('new'),
    name: z.string().trim().min(1).max(LIMITS.categoryName),
  }),
]);

const mappedImportSchema = z.object({
  items: z
    .array(mappedItemSchema)
    .min(1, '没有可导入的书签')
    .max(MAX_HTML_BOOKMARKS),
  mappings: z
    .array(z.object({ folderKey: z.string().max(200), mapping: folderMappingSchema }))
    .max(1000),
});

/** Imports the reviewed bookmark-HTML selection. */
export async function importMappedBookmarksAction(input: {
  items: MappedImportItem[];
  mappings: Array<{ folderKey: string; mapping: FolderMapping }>;
}): Promise<ImportMappedResult> {
  const denied = await guardAction();
  if (denied) return { ok: false, message: denied.message };

  const parsed = mappedImportSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `导入数据无效：${issue?.message ?? '未知错误'}` };
  }
  const { items, mappings } = parsed.data;

  try {
    // Indexes folder mappings by folder key.
    const folderMappingByFolder = new Map(
      mappings.map((entry) => [entry.folderKey, entry.mapping]),
    );

    // Collects existing-category targets and new category names up front.
    const existingTargets = new Set<string>();
    const newCategoryNames = new Set<string>();
    for (const item of items) {
      if (item.categoryId) {
        existingTargets.add(item.categoryId);
        continue;
      }
      if (item.newCategoryName) newCategoryNames.add(item.newCategoryName);
      const mapping = folderMappingByFolder.get(item.folderKey);
      if (mapping?.kind === 'existing') {
        existingTargets.add(mapping.categoryId);
      } else if (mapping?.kind === 'new') {
        newCategoryNames.add(mapping.name);
      }
    }

    // Validates every existing-category target in one query.
    const foundCategories = await getCategoriesByIds([...existingTargets]);
    if (foundCategories.length !== existingTargets.size) {
      return { ok: false, message: '目标分类不存在或已被删除，请刷新后重试' };
    }

    // Creates all missing categories in one batched pass.
    const newCategories = await resolveOrCreateCategories(
      [...newCategoryNames].map((name) => ({ name })),
    );
    const resolveCategoryId = (
      item: z.output<typeof mappedItemSchema>,
    ): string | null => {
      if (item.categoryId) return item.categoryId;
      if (item.newCategoryName) {
        return newCategories.get(item.newCategoryName)?.id ?? null;
      }
      const mapping = folderMappingByFolder.get(item.folderKey);
      if (!mapping) return null;
      if (mapping.kind === 'existing') return mapping.categoryId;
      return newCategories.get(mapping.name)?.id ?? null;
    };

    const existingUrls = await getExistingBookmarkUrls(
      items.map((item) => item.url),
    );
    const tagMap = await tagLookup(items.map((item) => item.tags));

    const inputs: BulkBookmarkInput[] = [];
    let skipped = 0;
    for (const item of items) {
      if (existingUrls.has(item.url)) {
        skipped += 1;
        continue;
      }
      // De-dupes within the payload.
      existingUrls.add(item.url);
      const categoryId = resolveCategoryId(item);
      if (!categoryId) {
        return { ok: false, message: '部分书签缺少分类映射，请返回映射步骤检查' };
      }
      inputs.push({
        categoryId,
        title: item.title,
        url: item.url,
        description: item.description ?? '',
        iconUrl: item.iconUrl ?? null,
        tagIds: idsFor(item.tags, tagMap),
        tagNames: item.tags,
        createdAt: item.createdAt || null,
      });
    }

    const created = await createBookmarksBulk(inputs);
    revalidateSite();
    return {
      ok: true,
      created,
      skipped,
      categories: new Set(inputs.map((input) => input.categoryId)).size,
    };
  } catch (error) {
    return { ok: false, message: userMessage(error, '导入失败，请重试') };
  }
}

// ── 3. OrigamiNav JSON backup ────────────────────────────────────────────────

const jsonBookmarkSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.title),
  url: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.url)
    .pipe(httpUrlSchema('URL 无效')),
  description: z.string().max(LIMITS.description).optional().default(''),
  iconUrl: z
    .string()
    .max(LIMITS.url)
    .nullish()
    .refine((v) => !v || isValidHttpUrl(v), '图标地址无效'),
  sortOrder: z.number().int().optional(),
  /** Absent in backups made before click counts were carried. */
  clickCount: z.number().int().min(0).optional(),
  createdAt: z.string().optional(),
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.tagName))
    .max(LIMITS.tagsPerBookmark)
    .optional()
    .default([]),
});

const jsonCategorySchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.categoryName),
  slug: z.string().trim().max(64).optional(),
  description: z.string().max(LIMITS.categoryDescription).optional().default(''),
  icon: z.string().max(40).nullish(),
  color: z.string().max(20).nullish(),
  sortOrder: z.number().int().optional(),
  bookmarks: z.array(jsonBookmarkSchema).optional().default([]),
});

const jsonPayloadSchema = z.object({
  app: z.literal('origaminav').optional(),
  version: z.number().optional(),
  categories: z.array(jsonCategorySchema).min(1).max(500),
});

export async function importJsonAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const file = formData.get('file');
  const mode = formData.get('mode') === 'replace' ? 'replace' : 'merge';

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, field: 'file', message: '请选择 JSON 备份文件' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, field: 'file', message: '文件超过 2MB 限制' };
  }

  let payloadText: string;
  try {
    payloadText = await file.text();
  } catch {
    return { ok: false, field: 'file', message: '文件读取失败' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payloadText);
  } catch {
    return { ok: false, field: 'file', message: '不是有效的 JSON 文件' };
  }

  const parsed = jsonPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: 'file',
      message: `JSON 结构不符合备份格式：${issue?.message ?? '未知错误'}${issue?.path.length ? `（${issue.path.join('.')}）` : ''}`,
    };
  }

  const totalBookmarks = parsed.data.categories.reduce(
    (sum, c) => sum + c.bookmarks.length,
    0,
  );
  if (totalBookmarks > MAX_JSON_BOOKMARKS) {
    return { ok: false, field: 'file', message: `备份过大（${totalBookmarks} 条书签）` };
  }

  try {
    let result: { categories: number; bookmarks: number };

    if (mode === 'replace') {
      result = await replaceAllData(
        parsed.data.categories as ExportCategory[],
      );
    } else {
      result = await mergeImport(parsed.data.categories);
    }

    revalidateSite();
    return {
      ok: true,
      message:
        mode === 'replace'
          ? `已用备份替换全部数据：${result.categories} 个分类，${result.bookmarks} 条书签`
          : `合并导入完成：新增 ${result.bookmarks} 条书签，涉及 ${result.categories} 个分类`,
    };
  } catch (error) {
    return { ok: false, message: userMessage(error, '导入失败，请重试') };
  }
}

/** Merges categories by name and skips bookmarks whose URL already exists. */
async function mergeImport(
  payloadCategories: z.output<typeof jsonCategorySchema>[],
): Promise<{ categories: number; bookmarks: number }> {
  const allBookmarks = payloadCategories.flatMap((c) => c.bookmarks);
  const existingUrls = await getExistingBookmarkUrls(
    allBookmarks.map((b) => b.url),
  );

  const tagMap = await tagLookup(payloadCategories.flatMap((c) => c.bookmarks.map((b) => b.tags)));
  // Resolves every category in one batched pass.
  const resolvedCategories = await resolveOrCreateCategories(
    payloadCategories.map((category) => ({
      name: category.name,
      description: category.description,
      icon: category.icon ?? null,
      color: category.color ?? null,
    })),
  );

  const inputs: BulkBookmarkInput[] = [];
  const touched = new Set<string>();

  for (const category of payloadCategories) {
    const row = resolvedCategories.get(category.name);
    if (!row) {
      throw new BusinessError(`分类「${category.name}」创建失败`);
    }
    touched.add(row.id);

    for (const bookmark of category.bookmarks) {
      if (existingUrls.has(bookmark.url)) continue;
      // De-dupes within the payload.
      existingUrls.add(bookmark.url);
      inputs.push({
        categoryId: row.id,
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description ?? '',
        iconUrl: bookmark.iconUrl ?? null,
        tagIds: idsFor(bookmark.tags ?? [], tagMap),
        tagNames: bookmark.tags ?? [],
        createdAt: bookmark.createdAt,
        clickCount: bookmark.clickCount,
      });
    }
  }

  const created = await createBookmarksBulk(inputs);
  return { categories: touched.size, bookmarks: created };
}
