import { getSiteAsset, SITE_ASSET_KEYS } from '@/db/queries/assets';

export const dynamic = 'force-dynamic';

/** Serves the uploaded site icon with nosniff and a sandbox CSP for SVG. */
export async function GET() {
  const asset = await getSiteAsset(SITE_ASSET_KEYS.favicon);
  if (!asset) {
    return new Response(null, { status: 404 });
  }

  const isSvg = asset.mimeType === 'image/svg+xml';
  const bytes = Buffer.from(asset.data, 'base64');

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
      ...(isSvg
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
        : {}),
      // ETag from the asset's updated timestamp.
      ETag: `"${asset.updatedAt}"`,
    },
  });
}
