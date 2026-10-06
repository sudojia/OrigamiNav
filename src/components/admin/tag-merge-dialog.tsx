'use client';

import { Check, Combine, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { mergeTagsAction, searchTagsAction } from '@/actions/tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, truncate } from '@/lib/utils';

import type { TagListRow } from '@/db/queries/tags';
import { useAdminDialogMode } from './admin-mode';

const SEARCH_DEBOUNCE_MS = 180;

/**
 * Merge picker. Targets are searched on the server, so the list stays short
 * even when the tag table holds thousands of rows.
 */
export function TagMergeDialog({
  sources,
  onClose,
  onMerged,
}: {
  sources: TagListRow[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const dialogMode = useAdminDialogMode();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<TagListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<TagListRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sourceIds = useMemo(() => sources.map((tag) => tag.id), [sources]);
  const refs = useMemo(
    () => sources.reduce((sum, tag) => sum + tag.count, 0),
    [sources],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchTagsAction({ query, excludeIds: sourceIds });
        if (!cancelled) setOptions(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, sourceIds]);

  const handleMerge = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const result = await mergeTagsAction({
        targetId: target.id,
        sourceIds,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onMerged();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('sm:max-w-lg', dialogMode)}>
        <DialogHeader>
          <DialogTitle>
            {sources.length === 1 ? '合并到其他标签' : `合并 ${sources.length} 个标签`}
          </DialogTitle>
          <DialogDescription>
            书签关联会迁移到目标标签，被合并的标签随后删除；书签本身不受影响，搜索索引会自动更新。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              待合并（{sources.length}）
            </p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/30 p-2">
              {sources.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="max-w-40 font-normal"
                  title={`${tag.name} · ${tag.count} 个书签`}
                >
                  <span className="truncate">{tag.name}</span>
                  <span className="shrink-0 tabular-nums opacity-60">
                    {tag.count}
                  </span>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">合并到</p>
            <Command
              shouldFilter={false}
              className="rounded-md border"
              aria-label="选择目标标签"
            >
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="搜索目标标签的名称或 slug"
                aria-label="搜索目标标签"
              />
              <CommandList className="max-h-56">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    搜索中…
                  </div>
                ) : (
                  <>
                    {options.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {query ? '没有匹配的标签' : '没有其他标签可作为目标'}
                      </div>
                    ) : null}
                    {options.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        onSelect={() => setTarget(option)}
                        className={cn(
                          'gap-2',
                          target?.id === option.id && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{option.name}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground/70">
                            /{option.slug}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {option.count > 0 ? `${option.count} 个书签` : '未使用'}
                        </span>
                        {target?.id === option.id ? (
                          <Check className="size-4 shrink-0 text-primary" aria-hidden />
                        ) : null}
                      </CommandItem>
                    ))}
                  </>
                )}
              </CommandList>
            </Command>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {refs > 0
              ? `最多 ${refs} 个书签关联会迁移`
              : '这些标签还没有被书签使用'}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!target || submitting}
              onClick={handleMerge}
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Combine className="size-4" aria-hidden />
              )}
              {target ? `合并到「${truncate(target.name, 12)}」` : '选择目标标签'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
