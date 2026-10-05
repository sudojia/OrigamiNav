'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { ICON_TEMPLATE_PLACEHOLDER, type IconService } from '@/types/nav';

import { useIconSettings } from './icon-settings';

/**
 * Resolves a bookmark favicon via the manual `iconUrl`, then the configured
 * icon service (from <IconSettingsProvider>, or an override prop used by the
 * settings preview); falls back to a first-letter colour block. A
 * per-provider timeout advances on a hung request.
 */

type Provider = (hostname: string) => string;

const PROVIDERS: Record<
  'cccyun' | 'xinac' | 'faviconim' | 'duckduckgo' | 'google',
  Provider
> = {
  cccyun: (host) => `https://favicon.cccyun.cc/${host}`,
  xinac: (host) => `https://api.xinac.net/icon/?url=${host}`,
  faviconim: (host) => `https://favicon.im/${host}?larger=true`,
  duckduckgo: (host) => `https://icons.duckduckgo.com/ip3/${host}.ico`,
  google: (host) => `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
};

const PROVIDER_TIMEOUT_MS = 2000;

/** Providers for the configured service; 'auto' pairs a fast CN source with an independent fallback. */
function providerChain(
  service: IconService,
  customTemplate: string | null,
): Provider[] {
  switch (service) {
    case 'off':
      return [];
    case 'custom':
      if (!customTemplate?.includes(ICON_TEMPLATE_PLACEHOLDER)) return [];
      return [(host) => customTemplate.replaceAll(ICON_TEMPLATE_PLACEHOLDER, host)];
    case 'auto':
      return [PROVIDERS.cccyun, PROVIDERS.faviconim];
    default:
      return [PROVIDERS[service]];
  }
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
  service: serviceOverride,
  customTemplate: templateOverride,
  className,
}: {
  hostname: string;
  title: string;
  iconUrl?: string | null;
  /** Overrides the provider context; used by the live settings preview. */
  service?: IconService;
  /** Overrides the custom template from the context. */
  customTemplate?: string | null;
  className?: string;
}) {
  const settings = useIconSettings();
  const service = serviceOverride ?? settings.service;
  const customTemplate = templateOverride ?? settings.customTemplate;

  // Candidate list: manual icon first, then the configured provider chain.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (iconUrl) list.push(iconUrl);
    if (hostname) {
      list.push(...providerChain(service, customTemplate).map((p) => p(hostname)));
    }
    return list;
  }, [iconUrl, hostname, service, customTemplate]);

  const [index, setIndex] = useState(0);
  // Drives the fade-in; flipped when the current candidate has painted.
  const [loaded, setLoaded] = useState(false);

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

  return (
    <span className={cn('flex shrink-0', className)}>
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
