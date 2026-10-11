import type { ComponentType, ReactNode } from 'react';

/** Shared dashed empty-state card; `Icon` optional for plain notices,
 * `compact` for nested contexts (e.g. inside a category section). */
export function EmptyState({
  Icon,
  title,
  hint,
  action,
  compact = false,
}: {
  Icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
        {title}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border/80 bg-card/60 px-6 py-12 text-center">
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-card bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? (
        <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
