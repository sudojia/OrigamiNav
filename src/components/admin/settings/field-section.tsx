import { Type } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Icon-titled block that groups the fields of one settings panel. */
export function FieldSection({
  Icon,
  title,
  description,
  divided,
  children,
}: {
  Icon: typeof Type;
  title: string;
  description?: string;
  divided?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn('space-y-4', divided && 'border-t border-border/60 pt-5')}
    >
      <header className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}
