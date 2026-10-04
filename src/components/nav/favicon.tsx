'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Resolves a favicon via the manual `iconUrl`, public favicon services, then a
 * first-letter colour block; a per-provider timeout advances on a hung request.
 */

type Provider = (hostname: string) => string;

const PROVIDERS: Provider[] = [
  (host) => `https://icons.duckduckgo.com/ip3/${host}.ico`,
  (host) => `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
  (host) => `https://favicon.im/${host}?larger=true`,
];

const PROVIDER_TIMEOUT_MS = 4000;

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
  className,
}: {
  hostname: string;
  title: string;
  iconUrl?: string | null;
  className?: string;
}) {
  // Candidate list: manual icon first, then each provider.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (iconUrl) list.push(iconUrl);
    if (hostname) list.push(...PROVIDERS.map((p) => p(hostname)));
    return list;
  }, [iconUrl, hostname]);

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Resets the fallback chain when the slot switches to a different bookmark.
  const signature = `${iconUrl ?? ''}|${hostname}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (prevSignature !== signature) {
    setPrevSignature(signature);
    setIndex(0);
    setFailed(false);
  }

  const exhausted = failed || index >= candidates.length;

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
    if (exhausted) return;
    timerRef.current = setTimeout(advance, PROVIDER_TIMEOUT_MS);
    return clearTimer;
  }, [exhausted, advance, clearTimer, index, signature]);

  if (exhausted || candidates.length === 0) {
    const letter = (title.trim()[0] ?? hostname[0] ?? '?').toUpperCase();
    return (
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md text-[0.7rem] font-semibold text-white select-none',
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

  return (
    <span className={cn('flex shrink-0', className)}>
      {/* Uses a plain <img>; the fallback chain needs onError. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidates[index]}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full rounded-md object-contain"
        onLoad={clearTimer}
        onError={advance}
      />
    </span>
  );
}
