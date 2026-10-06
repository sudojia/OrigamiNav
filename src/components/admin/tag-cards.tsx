'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn, formatDate } from '@/lib/utils';

import {
  InlineRename,
  RowActions,
  UsageMeter,
  type TagRowProps,
} from './tag-row-parts';

/** Card view, for browsing tags instead of working through them. */
export function TagCard({
  tag,
  selected,
  maxCount,
  renaming,
  busy,
  onToggle,
  onStartRename,
  onCancelRename,
  onRename,
  onMerge,
  onDelete,
}: TagRowProps) {
  return (
    <div
      className={cn(
        'group/card flex flex-col gap-2.5 rounded-card border bg-card p-3 shadow-card transition-colors',
        selected ? 'border-primary/45 bg-primary/5' : 'hover:border-primary/35',
        busy && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`选择 ${tag.name}`}
          className="mt-1"
        />
        {renaming ? (
          <div className="min-w-0 flex-1">
            <InlineRename
              tag={tag}
              busy={busy}
              onSave={onRename}
              onCancel={onCancelRename}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{tag.name}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                /{tag.slug}
              </p>
            </div>
            <RowActions
              tag={tag}
              renaming={renaming}
              onStartRename={onStartRename}
              onMerge={onMerge}
              onDelete={onDelete}
            />
          </>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <UsageMeter count={tag.count} max={maxCount} align="left" />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatDate(tag.createdAt)}
        </span>
      </div>
    </div>
  );
}
