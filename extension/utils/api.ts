import type { ExtConfig } from './config';

/** Typed client for the site's `/api/ext/*` REST endpoints. */

export interface ExtCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface ExistingBookmark {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
}

export interface ExtContext {
  siteName: string;
  categories: ExtCategory[];
  existing: ExistingBookmark | null;
}

export type ApiFailure =
  | { kind: 'unauthorized'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'server'; message: string }
  | { kind: 'duplicate'; message: string; existing: ExistingBookmark };

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  config: ExtConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError({
      kind: 'network',
      message: '无法连接服务器，请检查地址与网络',
    });
  }

  const body = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { message?: string })
    | null;

  if (response.status === 401) {
    throw new ApiError({
      kind: 'unauthorized',
      message: '令牌无效或已吊销，请更新扩展设置',
    });
  }
  if (response.status === 409) {
    throw new ApiError({
      kind: 'duplicate',
      message: body?.message ?? '该书签已存在',
      existing: body?.existing as ExistingBookmark,
    });
  }
  if (!response.ok) {
    throw new ApiError({
      kind: 'server',
      message: body?.message ?? `请求失败（${response.status}）`,
    });
  }
  return body as T;
}

/** Site name, categories in display order, and a duplicate check. */
export function fetchContext(
  config: ExtConfig,
  pageUrl: string,
): Promise<ExtContext> {
  return request(config, `/api/ext/context?url=${encodeURIComponent(pageUrl)}`);
}

/** Idempotent: reuses the existing category on an exact name match. */
export function createCategory(
  config: ExtConfig,
  input: { name: string },
): Promise<{ category: ExtCategory; created: boolean }> {
  return request(config, '/api/ext/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface CreateBookmarkInput {
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  categoryId: string;
  /** Private bookmarks stay invisible on the public site (admin only). */
  hidden?: boolean;
  /** Adds a second bookmark even when the URL already exists. */
  force?: boolean;
}

export function createBookmark(
  config: ExtConfig,
  input: CreateBookmarkInput,
): Promise<{ id: string }> {
  return request(config, '/api/ext/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface ExtBookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  /** Private bookmarks stay invisible on the public site (admin only). */
  hidden: boolean;
  categoryId: string;
  categoryName: string;
  tags: string[];
}

/** Category option for the manager's editor. */
export interface ExtCategoryOption {
  id: string;
  name: string;
}

export interface ExtSearchResult {
  bookmarks: ExtBookmark[];
  /** Live categories, so the editor can move a bookmark without a second call. */
  categories: ExtCategoryOption[];
}

/** Live bookmarks matching a keyword; hidden ones are included. */
export function searchBookmarks(
  config: ExtConfig,
  query: string,
): Promise<ExtSearchResult> {
  return request<ExtSearchResult>(
    config,
    `/api/ext/bookmarks?q=${encodeURIComponent(query)}`,
  );
}

export interface UpdateBookmarkInput {
  title: string;
  categoryId: string;
  tags: string[];
}

/** Replaces a bookmark's title, category and tags. */
export async function updateBookmark(
  config: ExtConfig,
  id: string,
  input: UpdateBookmarkInput,
): Promise<void> {
  await request<unknown>(
    config,
    `/api/ext/bookmarks/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Moves a bookmark to the site's recycle bin. */
export async function deleteBookmark(
  config: ExtConfig,
  id: string,
): Promise<void> {
  await request<unknown>(
    config,
    `/api/ext/bookmarks/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
