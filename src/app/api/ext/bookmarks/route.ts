import { z } from 'zod';

import { createBookmark, getBookmarkByUrl } from '@/db/queries/bookmarks';
import { getCategoryById } from '@/db/queries/categories';
import { errorMessage } from '@/db/client';
import { extJson, extPreflight, verifyExtToken } from '@/lib/ext-api';
import { queueAiTagGeneration } from '@/lib/ai-tags';
import { revalidateSite } from '@/lib/revalidate';
import { httpUrlSchema, LIMITS, optionalHttpUrlSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Creates a bookmark from the browser extension. */

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

  const category = await getCategoryById(input.categoryId);
  if (!category) {
    return extJson(
      { ok: false, message: '分类不存在，请刷新后重新选择' },
      { status: 400 },
    );
  }

  if (!input.force) {
    const existing = await getBookmarkByUrl(input.url);
    if (existing) {
      return extJson(
        { ok: false, code: 'duplicate', existing },
        { status: 409 },
      );
    }
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
    return extJson(
      { ok: false, message: `创建失败：${errorMessage(error)}` },
      { status: 500 },
    );
  }
}
