/** Instant skeleton while the target admin page renders server-side. */
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="加载中">
      <div className="flex items-start gap-3">
        <div className="size-10 animate-pulse rounded-card bg-muted" />
        <div className="space-y-2 pt-1">
          <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-card border bg-muted/40" />
        <div className="h-24 animate-pulse rounded-card border bg-muted/40" />
        <div className="h-24 animate-pulse rounded-card border bg-muted/40" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="h-56 animate-pulse rounded-card border bg-muted/40" />
        <div className="h-56 animate-pulse rounded-card border bg-muted/40" />
      </div>

      <div className="h-40 animate-pulse rounded-card border bg-muted/40" />
    </div>
  );
}
