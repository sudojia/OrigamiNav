import { clampInt } from '@/lib/utils';

/** Tag list query state, shared by the admin tags page and its client list. */

export const TAG_SORT_OPTIONS = [
  { value: 'name', label: '名称（拼音 A→Z）' },
  { value: 'name-desc', label: '名称（拼音 Z→A）' },
  { value: 'count', label: '引用最多' },
  { value: 'count-asc', label: '引用最少' },
  { value: 'newest', label: '最近创建' },
  { value: 'oldest', label: '最早创建' },
] as const;

export const TAG_USAGE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'used', label: '使用中' },
  { value: 'unused', label: '未使用' },
] as const;

export type TagSort = (typeof TAG_SORT_OPTIONS)[number]['value'];
export type TagUsageFilter = (typeof TAG_USAGE_FILTERS)[number]['value'];

/** Rows per page offered in the footer. */
export const TAG_PAGE_SIZES = [24, 48, 96] as const;
export const TAG_DEFAULT_PAGE_SIZE = 24;

/** Cap on one bulk delete or merge, so a single action stays bounded. */
export const TAG_BULK_LIMIT = 200;

/** Longest search string kept from the URL. */
export const TAG_QUERY_MAX = 60;

export type TagListQuery = {
  query: string;
  usage: TagUsageFilter;
  sort: TagSort;
  page: number;
  limit: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? (value[0] ?? '') : '';
}

function pick<T extends string>(
  options: readonly { value: T }[],
  candidate: string,
  fallback: T,
): T {
  return options.some((option) => option.value === candidate)
    ? (candidate as T)
    : fallback;
}

function parsePageSize(value: string): number {
  const size = Number.parseInt(value, 10);
  return (TAG_PAGE_SIZES as readonly number[]).includes(size)
    ? size
    : TAG_DEFAULT_PAGE_SIZE;
}

/** Normalizes arbitrary URL params into a query the DB layer accepts. */
export function parseTagListQuery(params: SearchParams): TagListQuery {
  return {
    query: first(params.q).trim().slice(0, TAG_QUERY_MAX),
    usage: pick(TAG_USAGE_FILTERS, first(params.usage), 'all'),
    sort: pick(TAG_SORT_OPTIONS, first(params.sort), 'name'),
    page: clampInt(first(params.page), { min: 1, max: 10_000 }, 1),
    limit: parsePageSize(first(params.per)),
  };
}

/** Admin tags URL for a query, dropping defaults so plain visits stay clean. */
export function tagListHref(query: TagListQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set('q', query.query);
  if (query.usage !== 'all') params.set('usage', query.usage);
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.limit !== TAG_DEFAULT_PAGE_SIZE) params.set('per', String(query.limit));
  const search = params.toString();
  return search ? `/admin/tags?${search}` : '/admin/tags';
}

export type TagListPatch = Partial<TagListQuery>;

/** Applies a patch and drops any page offset the patch did not ask for. */
export function applyTagListPatch(
  query: TagListQuery,
  patch: TagListPatch,
): TagListQuery {
  const next = { ...query, ...patch };
  // Filter and sort changes restart at page 1 unless the patch sets a page.
  if (patch.page === undefined) next.page = 1;
  return next;
}
