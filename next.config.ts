import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/** http(s) origin for a CSP allow-list entry; anything else is ignored. */
function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

// Self-hosted analytics (Umami, Plausible) needs its script origin allowed at
// build time; read here because the CSP is baked into the routes manifest.
const selfHostedAnalyticsOrigin = normalizeOrigin(
  process.env.ANALYTICS_SCRIPT_ORIGIN,
);

/** Script origins of the analytics loaders the admin can enable. */
const analyticsScriptOrigins = [
  'https://www.googletagmanager.com',
  'https://hm.baidu.com',
  'https://hmcdn.baidu.com',
  ...(selfHostedAnalyticsOrigin ? [selfHostedAnalyticsOrigin] : []),
].join(' ');

/** Beacon endpoints of the same loaders. */
const analyticsConnectOrigins = [
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://analytics.google.com',
  'https://*.analytics.google.com',
  'https://hm.baidu.com',
  ...(selfHostedAnalyticsOrigin ? [selfHostedAnalyticsOrigin] : []),
].join(' ');

/** Content-Security-Policy for every response except the uploaded site icon. */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} ${analyticsScriptOrigins}`,
  "style-src 'self' 'unsafe-inline'",
  // Allows any remote image origin for hotlinked bookmark favicons.
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  // Same-origin plus the analytics beacons; development adds ws/wss for the HMR socket.
  `connect-src 'self' ${analyticsConnectOrigins}${isProduction ? '' : ' ws: wss:'}`,
  ...(isProduction ? [] : ["worker-src 'self' blob:"]),
  "manifest-src 'self'",
].join('; ');

const securityHeaders = [
  // Disables MIME type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Fallback for browsers without frame-ancestors support.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Added in production only.
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : []),
];

const nextConfig: NextConfig = {
  // Emits .next/standalone. It does not copy .next/static, public/, or drizzle/.
  output: 'standalone',
  // Raises the default 1MB server-action body limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Disables next/image optimization.
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        // IndexNow key file at the site root: /<key>.txt. The protocol only
        // accepts URLs under the key file's own path, so it must live at "/".
        source: '/:key([A-Za-z0-9-]{8,128}).txt',
        destination: '/api/indexnow-key/:key',
      },
    ];
  },
  async headers() {
    return [
      {
        // Every route except the uploaded site icon, which sets its own sandbox policy.
        source: '/:path((?!api/site-icon$).*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
