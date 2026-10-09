'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { iconSourceTemplates } from '@/lib/icon-providers';
import { cn } from '@/lib/utils';
import { ICON_TEMPLATE_PLACEHOLDER, type IconService } from '@/types/nav';

import { useIconSettings } from './icon-settings';

/**
 * Resolves a bookmark favicon through the site's own icon proxy, which runs the
 * configured source chain server-side and caches the bytes — so the visitor's
 * browser normally never talks to a third-party service. The manual `iconUrl`
 * is the proxy's first source, and stays a direct fallback for the rare case
 * where the server cannot fetch it but the browser can. The settings preview
 * overrides the service, and an unsaved choice has no cache entry yet, so it
 * queries the providers directly. A per-candidate timeout advances on a hung
 * request.
 */

/** The proxy walks the whole source chain server-side; give it room. */
const PROXY_TIMEOUT_MS = 8000;
const DIRECT_TIMEOUT_MS = 2000;

/** Distance outside the viewport at which a card starts resolving its icon.
 *  Matches the browser's own lazy-loading threshold, so the chain never starts
 *  later than the request it is waiting on. */
const PRELOAD_MARGIN = '1200px';

// ─── Shared viewport gate ────────────────────────────────────────────────────
//
// One observer for every icon. A card only starts its candidate chain once it
// is near the viewport: `loading="lazy"` holds the request back until then, so
// starting the timeout earlier would advance past candidates that were never
// fetched and pin offscreen cards on the letter fallback for good.

const pendingVisibility = new Map<Element, () => void>();
let viewportObserver: IntersectionObserver | null = null;

function observeOnce(element: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  viewportObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const callback = pendingVisibility.get(entry.target);
        pendingVisibility.delete(entry.target);
        viewportObserver?.unobserve(entry.target);
        callback?.();
      }
    },
    { rootMargin: PRELOAD_MARGIN },
  );
  pendingVisibility.set(element, onVisible);
  viewportObserver.observe(element);
  return () => {
    pendingVisibility.delete(element);
    viewportObserver?.unobserve(element);
  };
}

/** Returns a stable hue for a string. */
function hueOf(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function Favicon({
  hostname,
  title,
  iconUrl,
  bookmarkId,
  service: serviceOverride,
  customTemplate: templateOverride,
  className,
}: {
  hostname: string;
  title: string;
  /** Manual icon URL; the proxy prefers it and it stays the last resort. */
  iconUrl?: string | null;
  /** Lets the proxy resolve this bookmark's own icon URL from the database. */
  bookmarkId?: string;
  /** Overrides the provider context; used by the live settings preview. */
  service?: IconService;
  /** Overrides the custom template from the context. */
  customTemplate?: string | null;
  className?: string;
}) {
  const settings = useIconSettings();
  const service = serviceOverride ?? settings.service;
  const customTemplate = templateOverride ?? settings.customTemplate;
  // An override means the settings preview, which shows an unsaved choice.
  const previewing =
    serviceOverride !== undefined || templateOverride !== undefined;

  const candidates = useMemo(() => {
    const list: string[] = [];
    if (!hostname) return iconUrl ? [iconUrl] : [];

    const templates = iconSourceTemplates(service, customTemplate);

    if (previewing) {
      // The cache has never seen an unsaved choice, so the preview goes direct.
      if (iconUrl) list.push(iconUrl);
      list.push(
        ...templates.map((template) =>
          template.replaceAll(ICON_TEMPLATE_PLACEHOLDER, hostname),
        ),
      );
      return list;
    }

    if (templates.length > 0) {
      const query = bookmarkId ? `?b=${encodeURIComponent(bookmarkId)}` : '';
      list.push(`/api/icon/${encodeURIComponent(hostname)}${query}`);
    }
    // Reached only when the proxy had nothing to serve.
    if (iconUrl) list.push(iconUrl);
    return list;
  }, [iconUrl, bookmarkId, hostname, service, customTemplate, previewing]);

  const [index, setIndex] = useState(0);
  // Drives the fade-in; flipped when the current candidate has painted.
  const [loaded, setLoaded] = useState(false);
  // Flips once the card is near the viewport, which is when the chain starts.
  const [nearViewport, setNearViewport] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  // Resets the fallback chain whenever the icon source changes — bookmark slot
  // (iconUrl/hostname) or service selection (service/customTemplate). Without
  // this a stale index from a failed provider pins the tile on letter fallback.
  const signature = `${service}|${customTemplate ?? ''}|${iconUrl ?? ''}|${hostname}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (prevSignature !== signature) {
    setPrevSignature(signature);
    setIndex(0);
    setLoaded(false);
  }

  const exhausted = index >= candidates.length;
  // Resolves only when there is a candidate left and the card is in range.
  const resolving = nearViewport && !exhausted && candidates.length > 0;
  const resolveTimeoutMs = candidates[index]?.startsWith('/api/icon/')
    ? PROXY_TIMEOUT_MS
    : DIRECT_TIMEOUT_MS;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    clearTimer();
    setIndex((i) => i + 1);
  }, [clearTimer]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || nearViewport || candidates.length === 0) return;
    return observeOnce(element, () => setNearViewport(true));
  }, [nearViewport, candidates.length]);

  useEffect(() => {
    if (!resolving) return;
    timerRef.current = setTimeout(advance, resolveTimeoutMs);
    return clearTimer;
  }, [resolving, advance, clearTimer, index, signature, resolveTimeoutMs]);

  const letter = (title.trim()[0] ?? hostname[0] ?? '?').toUpperCase();

  if (candidates.length === 0 || exhausted) {
    return (
      <span
        ref={rootRef}
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md text-[0.7rem] font-semibold text-white select-none',
          'motion-reduce:animate-none animate-in fade-in duration-300',
          className,
        )}
        style={{
          // Hue comes from the domain hash; lightness and chroma are fixed.
          backgroundColor: `oklch(0.62 0.13 ${hueOf(hostname || title)})`,
        }}
      >
        {letter}
      </span>
    );
  }

  if (!nearViewport) {
    // Holds the tile's box open until the card is close enough to resolve.
    return (
      <span ref={rootRef} aria-hidden className={cn('flex shrink-0', className)} />
    );
  }

  return (
    <span ref={rootRef} className={cn('flex shrink-0', className)}>
      {/* Uses a plain <img>; the fallback chain needs onError. Keyed by src so
          a candidate switch mounts a fresh node instead of mutating this one. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={candidates[index]}
        src={candidates[index]}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          'size-full rounded-md object-contain transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        ref={(el) => {
          // Cached images can finish before React attaches onLoad.
          if (el?.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => {
          clearTimer();
          setLoaded(true);
        }}
        onError={advance}
      />
    </span>
  );
}
