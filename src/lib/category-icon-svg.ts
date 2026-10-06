import 'server-only';

import dynamicIconImports from 'lucide-react/dynamicIconImports';

/**
 * Category icons as static SVG markup for the nav payload. Rendering happens
 * here instead of on the client so the public page ships no icon components —
 * it inlines only the glyphs its categories actually use.
 */

/** Lucide's node shape: [tagName, attributes][]. */
type IconNode = Array<[string, Record<string, string>]>;

type IconLoader = () => Promise<{ __iconNode: IconNode }>;

const FALLBACK_ICON = 'folder';

/** Markup per icon name; names come from a fixed registry, so this is bounded. */
const cache = new Map<string, string>();

/** PascalCase registry name -> lucide's kebab-case module key. */
function kebabCase(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2');
  // Splits a digit run off the word before it, but leaves "3x3" intact.
  return spaced
    .replace(/\d+/g, (digits, offset: number, source: string) => {
      const previous = source[offset - 1];
      if (!previous || !/[a-zA-Z]/.test(previous)) return digits;
      if (offset > 1 && /\d/.test(source[offset - 2] ?? '')) return digits;
      return `-${digits}`;
    })
    .toLowerCase();
}

/** Attribute values are the icon package's static geometry, never user input. */
function serialize(node: IconNode): string {
  const body = node
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        // `key` is React's reconciliation hint, not an SVG attribute.
        .filter(([attr]) => attr !== 'key')
        .map(([attr, value]) => `${attr}="${value}"`)
        .join(' ');
      return `<${tag} ${rendered}></${tag}>`;
    })
    .join('');

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    `${body}</svg>`
  );
}

/** Static SVG for a stored icon name; null when the category has no icon. */
export async function categoryIconSvg(
  name: string | null | undefined,
): Promise<string | null> {
  if (!name) return null;

  const cached = cache.get(name);
  if (cached !== undefined) return cached || null;

  const loaders = dynamicIconImports as unknown as Record<string, IconLoader>;
  // Unknown names fall back to the folder glyph, as the client used to.
  const loader = loaders[kebabCase(name)] ?? loaders[FALLBACK_ICON];
  if (!loader) return null;

  const markup = serialize((await loader()).__iconNode);
  cache.set(name, markup);
  return markup;
}
