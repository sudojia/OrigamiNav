import { cn } from '@/lib/utils';

/** Small folded-paper mark. */
export function SiteMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none">
        <path d="M12 4.5 5.5 14H12Z" fill="currentColor" fillOpacity="0.95" />
        <path d="M12 4.5 18.5 14H12Z" fill="currentColor" fillOpacity="0.6" />
        <path d="M4 16H12V20H7.5Z" fill="currentColor" fillOpacity="0.8" />
        <path d="M12 16H20L16.5 20H12Z" fill="currentColor" fillOpacity="0.5" />
      </svg>
    </span>
  );
}

/** Renders the admin-configured logo, or the built-in mark otherwise. */
export function BrandMark({
  logoUrl,
  className,
}: {
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn('size-8 shrink-0 rounded-md object-cover', className)}
        onError={(event) => {
          // Hides a broken logo image.
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return <SiteMark className={className} />;
}
