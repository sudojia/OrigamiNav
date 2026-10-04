import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/** Content-Security-Policy for every response except the uploaded site icon. */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // Allows any remote image origin for hotlinked bookmark favicons.
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  // Same-origin; development adds ws/wss for the HMR socket.
  `connect-src 'self'${isProduction ? '' : ' ws: wss:'}`,
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
