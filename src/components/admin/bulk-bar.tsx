'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** Shared batch-action bar shell: selection count on the left, actions on the
 * right, `取消选择` last. `sticky` keeps actions reachable while selecting
 * further down the list. Consumers alias it locally as their own BulkBar. */
export function BulkBarShell({
  count,
  noun,
  sticky = false,
  onClear,
  children,
}: {
  count: number;
  /** Unit for the count line, e.g. 条书签 / 个标签. */
  noun: string;
  sticky?: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={
        sticky
          ? 'sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-card border border-primary/35 bg-primary/5 px-3 py-2 backdrop-blur lg:top-0'
          : 'flex flex-wrap items-center gap-2 rounded-card border border-primary/35 bg-primary/5 px-3 py-2'
      }
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        <Check className="size-4 text-primary" aria-hidden />
        已选 <span className="tabular-nums">{count}</span> {noun}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" className="h-8" onClick={onClear}>
          取消选择
        </Button>
      </div>
    </div>
  );
}
