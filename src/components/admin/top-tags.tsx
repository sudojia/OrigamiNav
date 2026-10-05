import { Tags } from 'lucide-react';

import { RankBar } from '@/components/admin/charts';

/** Dashboard panel ranking tags by bookmark count. */
export function TopTagsPanel({
  tags,
  total,
  refTotal,
}: {
  tags: Array<{ id: string; name: string; count: number }>;
  /** Total tags with at least one bookmark. */
  total: number;
  /** Total tag references, used for the share column. */
  refTotal: number;
}) {
  const maxCount = Math.max(1, ...tags.map((t) => t.count));

  return (
    <section className="flex flex-col rounded-card border bg-card p-5 shadow-card">
      <header>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Tags className="size-4 text-primary" aria-hidden />
          标签排行
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {total > tags.length
            ? `被引用最多的 ${tags.length} 个标签 · 共 ${total} 个使用中标签`
            : `共 ${total} 个使用中标签`}
          {' · '}按引用数排序
        </p>
      </header>
      {tags.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          还没有使用中的标签。
        </p>
      ) : (
        <ul className="mt-4 flex-1 space-y-2.5">
          {tags.map((tag, index) => (
            <RankBar
              key={tag.id}
              rank={index + 1}
              name={tag.name}
              count={tag.count}
              total={refTotal}
              max={maxCount}
              barClassName="bg-primary/60 group-hover:bg-primary"
              hash
              delayMs={index * 45}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
