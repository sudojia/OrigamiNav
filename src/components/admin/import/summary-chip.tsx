import { FileStack } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Small stat pill. */
export function SummaryChip({
  Icon,
  tone = 'default',
  children,
}: {
  Icon: typeof FileStack;
  tone?: 'default' | 'primary' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        tone === 'default' &&
          'border-border/60 bg-muted/40 text-muted-foreground',
        tone === 'primary' && 'border-primary/25 bg-primary/10 text-primary',
        tone === 'warn' && 'border-destructive/25 bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
