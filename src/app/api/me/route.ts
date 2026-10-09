import { getNavData } from '@/db/queries/nav';
import { getCurrentAdmin } from '@/lib/session';
import { tagSlugParamSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Session probe for the public page. A signed-in admin also receives the full
 * nav payload (hidden rows included) in the same response, so the page can
 * render hidden rows without a second round trip; anonymous callers get the
 * flag only and no bookmark data. `?tag=` narrows the payload for a tag page,
 * which would otherwise lose its filter to this response. `no-store` plus
 * `Vary: Cookie` keeps a CDN from serving one visitor's payload to another.
 */
export async function GET(request: Request) {
  let admin: { adminId: string; username: string } | null = null;

  try {
    admin = await getCurrentAdmin();
  } catch {
    // Fall back to null on error.
    admin = null;
  }

  const rawTag = new URL(request.url).searchParams.get('tag');
  const parsedTag = rawTag === null ? null : tagSlugParamSchema.safeParse(rawTag);
  const malformedTag = parsedTag !== null && !parsedTag.success;

  // A tag that cannot be parsed is not the same as no tag: sending the whole
  // site would put every category under a tag page's h1. Such a caller keeps
  // the slice the server already rendered and only gets the flag.
  const nav =
    admin && !malformedTag
      ? await getNavData({
          includeHidden: true,
          tagSlug: parsedTag?.data || undefined,
        })
      : null;

  return Response.json(
    {
      isAdmin: admin !== null,
      username: admin?.username ?? null,
      ...(nav ? { nav } : {}),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        Vary: 'Cookie',
      },
    },
  );
}
