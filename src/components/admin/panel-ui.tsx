import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Shared surface primitives for the admin's tabbed pages. */

/** Card head with icon tile, title, hint and an optional slot. */
export function TabCardHead({
  Icon,
  hue,
  title,
  description,
  children,
}: {
  Icon: typeof Check;
  hue: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border/60 bg-gradient-to-r from-primary/5 via-transparent to-transparent px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            hue,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Tab trigger styled as a rich tile. */
export const TILE_TRIGGER =
  'group h-auto flex-col items-start gap-2 rounded-card border border-border/70 bg-card/70 p-4 text-left whitespace-normal shadow-none transition-all hover:border-primary/35 hover:bg-card data-[state=active]:border-primary/45 data-[state=active]:bg-card data-[state=active]:shadow-card dark:data-[state=active]:bg-card';

/** Check badge shown on an active tile. */
export function TileActiveCheck({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity duration-200',
        active === undefined
          ? 'opacity-0 group-data-[state=active]:opacity-100'
          : active
            ? 'opacity-100'
            : 'opacity-0',
      )}
    >
      <Check className="size-3" />
    </span>
  );
}
