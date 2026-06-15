import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy. Shipped as Report-Only first so it can be tuned
 * against real traffic without breaking the app, then promoted to enforcing
 * by renaming the header key to "Content-Security-Policy".
 *
 * Allowances explained:
 *  - 'wasm-unsafe-eval'         → onnxruntime-web compiles WASM at runtime.
 *  - challenges.cloudflare.com  → Turnstile widget (script + iframe).
 *  - worker-src blob:           → the analysis Web Worker is a module worker.
 *  - 'unsafe-inline' (style)    → Tailwind v4 injects runtime styles.
 *  - connect-src 'self'         → /api routes and same-origin model fetches.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self' https://challenges.cloudflare.com",
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Microphone allowed only for same origin (the analyzer needs it).
    value: "camera=(), microphone=(self), geolocation=()",
  },
  // Enforced once tuned: rename to "Content-Security-Policy".
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // HTTPS-only; browsers ignore it over plain HTTP, safe to always send.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
