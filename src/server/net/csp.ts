/**
 * Content-Security-Policy for HTML responses.
 *
 * Scripts: nonce + 'strict-dynamic' (Next.js applies the nonce to its own
 * scripts when it sees it in the request CSP header). No inline or third-party
 * scripts are allowed.
 * Styles: 'unsafe-inline' is required for React/Motion `style` attributes
 * (CSP nonces do not cover style attributes). No external stylesheets.
 */
export function buildCsp(nonce: string, { dev = false, https = false } = {}): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? " ws:" : ""}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Static security headers applied to every response (see next.config.ts). */
export function securityHeaders({ https = false } = {}) {
  const h = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (https) h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  return h;
}
