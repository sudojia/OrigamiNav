import {
  Activity,
  FolderTree,
  LayoutDashboard,
  Link2,
  MousePointerClick,
  PieChart as PieChartIcon,
  Sparkles,
  Tags,
} from 'lucide-react';

import { PageHeader } from '@/components/admin/page-header';
import { buildDonutSlices, RankBar, StatCard } from '@/components/admin/charts';
import { CategoryDonut } from '@/components/admin/charts-client';
import { TopTagsPanel } from '@/components/admin/top-tags';
import { Favicon } from '@/components/nav/favicon';
import { getTagUsage } from '@/db/queries/nav';
import {
  getAdminCounts,
  getCategoryDistribution,
  getClickStats,
  getRecentBookmarks,
} from '@/db/queries/stats';
import { colorSwatchClass } from '@/lib/category-meta';
import { requireAdminPage } from '@/lib/session';
import { formatDate, hostnameOf } from '@/lib/utils';

export const metadata = { title: '总览' };

// Cap on the click and tag ranking lists.
const RANK_LIST_LIMIT = 10;

/** Renders the admin dashboard. */
export default async function AdminHomePage() {
  await requireAdminPage();

  const [counts, distribution, recent, tagUsage, clicks] = await Promise.all([
    getAdminCounts(),
    getCategoryDistribution(),
    getRecentBookmarks(12),
    getTagUsage(),
    getClickStats(RANK_LIST_LIMIT),
  ]);

  const maxCount = Math.max(1, ...distribution.map((d) => d.count));
  // Rank used tags by count, then name.
  const usedTags = tagUsage.filter((tag) => tag.count > 0);
  const usedTagTotal = usedTags.length;
  const topTags = usedTags
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, RANK_LIST_LIMIT);
  const tagRefTotal = usedTags.reduce((sum, tag) => sum + tag.count, 0);

  const maxClicks = Math.max(1, ...clicks.items.map((item) => item.clickCount));

  // Donut data: top 5 categories + "other", with share percentages.
  const donut = buildDonutSlices(distribution);

  return (
    <div className="space-y-6">
      <PageHeader
        Icon={LayoutDashboard}
        title="总览"
        description="内容修改保存后，前台无需重新部署即可看到变化。"
      />

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="分类"
          value={counts.categories}
          href="/admin/categories"
          Icon={FolderTree}
          hint="管理内容分组"
        />
        <StatCard
          label="书签"
          value={counts.bookmarks}
          href="/admin/bookmarks"
          Icon={Link2}
          hint="管理全部链接"
        />
        <StatCard
          label="标签"
          value={counts.tags}
          href="/admin/tags"
          Icon={Tags}
          hint="按主题筛选"
        />
      </div>

      {/* ── Clicks + Donut ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-card border bg-card p-5 shadow-card">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <MousePointerClick className="size-4 text-primary" aria-hidden />
                最常点击
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                前台打开次数最多的书签
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl leading-none font-semibold tabular-nums">
                {clicks.total}
              </p>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                总点击
              </p>
            </div>
          </header>
          {clicks.items.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              还没有点击记录。
            </p>
          ) : (
            <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {clicks.items.map((item, index) => (
                <RankBar
                  key={item.id}
                  rank={index + 1}
                  name={item.title}
                  count={item.clickCount}
                  total={clicks.total}
                  max={maxClicks}
                  barClassName="bg-primary/60 group-hover:bg-primary"
                  delayMs={index * 40}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border bg-card p-5 shadow-card">
          <header>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <PieChartIcon className="size-4 text-primary" aria-hidden />
              分类占比
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              书签在分类间的分布
            </p>
          </header>
          {distribution.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              还没有分类。
            </p>
          ) : (
            <CategoryDonut slices={donut} total={counts.bookmarks} />
          )}
        </section>
      </div>

      {/* ── Distribution bars + Tag ranking ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border bg-card p-5 shadow-card">
          <header>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Activity className="size-4 text-primary" aria-hidden />
              分类分布
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              按书签数排序
            </p>
          </header>
          {distribution.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              还没有分类。
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {[...distribution]
                .sort((a, b) => b.count - a.count)
                .map((item, index) => (
                  <RankBar
                    key={item.id}
                    rank={index + 1}
                    name={item.name}
                    count={item.count}
                    total={counts.bookmarks}
                    max={maxCount}
                    barClassName={colorSwatchClass(item.color)}
                    delayMs={index * 45}
                  />
                ))}
            </ul>
          )}
        </section>

        <TopTagsPanel
          tags={topTags}
          total={usedTagTotal}
          refTotal={tagRefTotal}
        />
      </div>

      {/* ── Recent additions ───────────────────────────────────────────── */}
      <section className="rounded-card border bg-card p-5 shadow-card">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" aria-hidden />
              最近添加
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              最新收录的 {recent.length} 条书签
            </p>
          </div>
          <a
            href="/admin/bookmarks"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            查看全部 →
          </a>
        </header>
        {recent.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            还没有书签。
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((bookmark) => (
              <li key={bookmark.id}>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full items-start gap-2.5 rounded-lg border border-border/60 bg-background/50 p-3 transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm"
                >
                  <Favicon
                    hostname={hostnameOf(bookmark.url)}
                    title={bookmark.title}
                    className="mt-0.5 size-7 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-primary">
                      {bookmark.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {bookmark.categoryName} · {hostnameOf(bookmark.url)}
                    </span>
                    <span className="mt-1 block font-mono text-[0.625rem] text-muted-foreground/70 tabular-nums">
                      {formatDate(bookmark.createdAt)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
