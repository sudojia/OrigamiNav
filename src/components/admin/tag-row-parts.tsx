'use client';

import { Check, Combine, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { TagListRow } from '@/db/queries/tags';

import { RowAction } from './row-action';

/** Row pieces shared by the tag table and the tag cards. */

export type TagRowProps = {
  tag: TagListRow;
  selected: boolean;
  /** Highest bookmark count on the page, for the usage meter. */
  maxCount: number;
  renaming: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (name: string) => void | Promise<void>;
  onMerge: () => void;
  onDelete: () => void;
};

export function RowActions({
  tag,
  renaming,
  onStartRename,
  onMerge,
  onDelete,
}: {
  tag: TagListRow;
  renaming: boolean;
  onStartRename: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100 group-hover/card:opacity-100 focus-within:opacity-100">
      <RowAction
        label={`重命名 ${tag.name}`}
        hint="重命名标签"
        pressed={renaming}
        className="size-7"
        onClick={onStartRename}
      >
        <Pencil className="size-3.5" />
      </RowAction>
      <RowAction
        label={`合并 ${tag.name} 到其他标签`}
        hint="合并到其他标签"
        className="hidden size-7 md:inline-flex"
        onClick={onMerge}
      >
        <Combine className="size-3.5" />
      </RowAction>
      <RowAction
        label={`删除 ${tag.name}`}
        hint="删除标签，不可恢复"
        destructive
        className="size-7"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </RowAction>
    </div>
  );
}

/** Inline name editor: Enter or the check saves, Escape or the cross cancels. */
export function InlineRename({
  tag,
  busy,
  onSave,
  onCancel,
}: {
  tag: TagListRow;
  busy: boolean;
  onSave: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="flex min-w-0 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(value);
      }}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        // Unchanged names close on blur; edited ones stay open so nothing is lost.
        onBlur={() => {
          if (value.trim() === tag.name) onCancel();
        }}
        maxLength={30}
        disabled={busy}
        aria-label={`重命名 ${tag.name}`}
        className="h-7 min-w-0 flex-1 text-sm"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-primary"
        disabled={busy}
        aria-label="保存名称"
      >
        {busy ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        disabled={busy}
        onClick={onCancel}
        aria-label="取消重命名"
      >
        <X className="size-4" />
      </Button>
    </form>
  );
}

/** Bookmark count with a bar scaled against the busiest tag on the page. */
export function UsageMeter({
  count,
  max,
  align = 'right',
}: {
  count: number;
  max: number;
  align?: 'left' | 'right';
}) {
  if (count === 0) {
    return (
      <span
        className={cn(
          'block text-xs text-muted-foreground',
          align === 'right' && 'text-right',
        )}
      >
        未使用
      </span>
    );
  }

  return (
    <span
      className={cn('flex items-center gap-2', align === 'right' && 'justify-end')}
      title={`${count} 个书签使用`}
    >
      <span
        aria-hidden
        className="hidden h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted sm:block"
      >
        <span
          className="bar-fill block h-full rounded-full bg-primary/60"
          style={{ '--bar-scale': Math.min(1, count / max) } as CSSProperties}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{count}</span> 个书签
      </span>
    </span>
  );
}
