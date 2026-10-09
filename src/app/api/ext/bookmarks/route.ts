import { z } from 'zod';

import { createBookmark, getBookmarkByUrl } from '@/db/queries/bookmarks';
import { listCategoryOptions } from '@/db/queries/categories';
import { errorMessage, pgErrorCode } from '@/db/client';
import { searchExtBookmarks } from '@/db/queries/search';
import { extJson, extPreflight, verifyExtToken } from '@/lib/ext-api';
import { queueAiTagGeneration } from '@/lib/ai-tags';
import { revalidateSite } from '@/lib/revalidate';
import { httpUrlSchema, LIMITS, optionalHttpUrlSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lists existing bookmarks and creates new ones for the browser extension. */

const EXT_SEARCH_LIMIT_MAX = 50;
const EXT_SEARCH_TERM_MAX = 100;

const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, '请输入搜索关键词')
    .max(EXT_SEARCH_TERM_MAX, `关键词最长 ${EXT_SEARCH_TERM_MAX} 个字符`),
  limit: z.coerce.number().int().min(1).max(EXT_SEARCH_LIMIT_MAX).default(20),
});

const bodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '请输入标题')
    .max(LIMITS.title, `标题最多 ${LIMITS.title} 个字`),
  url: z
    .string()
    .trim()
    .min(1, '请输入 URL')
    .max(LIMITS.url, `URL 最长 ${LIMITS.url} 个字符`)
    .pipe(httpUrlSchema('请输入 http(s):// 开头的完整链接')),
  // Optional fields tolerate missing keys and JSON nulls from clients.
  description: z.preprocess(
    (value) => (value == null ? '' : value),
    z.string().trim().max(LIMITS.description, `描述最多 ${LIMITS.description} 个字`),
  ),
  iconUrl: z.preprocess(
    (value) => (value == null ? '' : value),
    optionalHttpUrlSchema(LIMITS.url, '图标地址'),
  ),
  categoryId: z.string().min(1, '请选择分类'),
  // Private bookmarks stay invisible on the public site, admin only.
  hidden: z.boolean().default(false),
  // Adds a second bookmark for a URL that already exists.
  force: z.boolean().default(false),
});

export async function OPTIONS() {
  return extPreflight();
}

/** Searches existing bookmarks for the popup's manager view. */
export async function GET(request: Request) {
  if (!(await verifyExtToken(request))) {
    return extJson({ ok: false, message: '扩展令牌无效或未配置' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const parsed = searchSchema.safeParse({
    q: params.get('q') ?? '',
    limit: params.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return extJson(
      { ok: false, message: parsed.error.issues[0]?.message ?? '输入有误' },
      { status: 400 },
    );
  }

  // Categories ride along so the manager's editor always has the full list.
  const [bookmarks, categories] = await Promise.all([
    searchExtBookmarks(parsed.data.q, parsed.data.limit),
    listCategoryOptions(),
  ]);

  return extJson({
    ok: true,
    categories,
    bookmarks: bookmarks.map((bookmark) => ({
      ...bookmark,
      tags: bookmark.tags.map((tag) => tag.name),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await verifyExtToken(request))) {
    return extJson({ ok: false, message: '扩展令牌无效或未配置' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return extJson(
      {
        ok: false,
        message: parsed.error.issues[0]?.message ?? '输入有误',
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = input.force ? null : await getBookmarkByUrl(input.url);
  if (existing) {
    return extJson({ ok: false, code: 'duplicate', existing }, { status: 409 });
  }

  try {
    const created = await createBookmark({
      categoryId: input.categoryId,
      title: input.title,
      url: input.url,
      description: input.description,
      iconUrl: input.iconUrl === '' ? null : input.iconUrl,
      hidden: input.hidden,
      tagIds: [],
      tagNames: [],
    });
    // Background AI tags; no-op when AI is not configured.
    queueAiTagGeneration(created.id, {
      url: input.url,
      title: input.title,
      description: input.description,
    });
    revalidateSite();
    return extJson({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    // 23503 FK violation: category deleted since the popup loaded.
    if (pgErrorCode(error) === '23503') {
      return extJson(
        { ok: false, message: '分类不存在，请刷新后重新选择' },
        { status: 400 },
      );
    }
    return extJson(
      { ok: false, message: `创建失败：${errorMessage(error)}` },
      { status: 500 },
    );
  }
}
