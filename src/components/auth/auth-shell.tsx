import type { ReactNode } from 'react';

/** Shared chrome for /setup and /login. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      {/* Background glows and an oversized fold mark. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(42% 34% at 18% 0%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 72%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(38% 30% at 86% 100%, color-mix(in oklch, var(--primary) 7%, transparent), transparent 70%)',
          }}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="absolute -bottom-44 -right-36 size-[36rem] rotate-12 text-foreground opacity-[0.035] max-sm:hidden"
        >
          <path d="M12 3 3 12l9 3 9-3-9-9Z" fill="currentColor" fillOpacity="0.95" />
          <path d="m3 12 9 9 9-9-9 3-9-3Z" fill="currentColor" fillOpacity="0.6" />
        </svg>
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-timing-function:cubic-bezier(0.16,1,0.3,1)] [animation-fill-mode:both]">
          <div
            aria-hidden
            className="mb-4 flex size-11 items-center justify-center rounded-card bg-primary text-primary-foreground shadow-raised"
          >
            {/* Folded-paper mark. */}
            <svg viewBox="0 0 24 24" className="size-6" fill="none">
              <path
                d="M12 3 3 12l9 3 9-3-9-9Z"
                fill="currentColor"
                fillOpacity="0.95"
              />
              <path d="m3 12 9 9 9-9-9 3-9-3Z" fill="currentColor" fillOpacity="0.6" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-muted-foreground text-balance">
              {description}
            </p>
          ) : null}
        </div>

        <div className="rounded-card border border-border bg-card p-6 shadow-card motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:80ms] [animation-timing-function:cubic-bezier(0.16,1,0.3,1)] [animation-fill-mode:both]">
          {children}
        </div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
