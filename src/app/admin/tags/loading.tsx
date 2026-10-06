/** Skeleton shaped like the tag manager while its page query runs. */
export default function AdminTagsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="加载中">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="size-10 animate-pulse rounded-card bg-muted" />
          <div className="space-y-2 pt-1">
            <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
      </div>

      <div className="h-[3.25rem] animate-pulse rounded-card border bg-muted/40" />

      <div className="space-y-2 rounded-card border bg-card p-3">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="h-8 animate-pulse rounded-md bg-muted/60"
            style={{ animationDelay: `${index * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
