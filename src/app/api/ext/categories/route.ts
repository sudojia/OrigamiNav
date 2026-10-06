import { z } from 'zod';

import { errorMessage } from '@/db/client';
import {
  getCategoryByName,
  getOrCreateCategoryByName,
} from '@/db/queries/categories';
import { extJson, extPreflight, verifyExtToken } from '@/lib/ext-api';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Idempotent: an exact name match returns the existing category. */

const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入分类名称')
    .max(LIMITS.categoryName, `分类名最多 ${LIMITS.categoryName} 个字`),
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
      { ok: false, message: parsed.error.issues[0]?.message ?? '输入有误' },
      { status: 400 },
    );
  }

  try {
    const existing = await getCategoryByName(parsed.data.name);
    const category =
      existing ?? (await getOrCreateCategoryByName(parsed.data.name));
    if (!existing) revalidateSite();
    return extJson(
      {
        ok: true,
        created: !existing,
        category: {
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
        },
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    return extJson(
      { ok: false, message: `创建失败：${errorMessage(error)}` },
      { status: 500 },
    );
  }
}
