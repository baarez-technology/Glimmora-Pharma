/**
 * The edge gate's route matcher, isolated from `proxy.ts` so it can be unit
 * tested without loading `next/server` or `next-auth/jwt`.
 *
 * Every entry in EDGE_EXCLUDED_PREFIXES is a path an UNAUTHENTICATED request is
 * allowed to reach. Adding one is a security decision, not a convenience:
 *
 *   login          the sign-in page itself
 *   api/auth       NextAuth's own handlers, which by definition have no session yet
 *   api/webhooks   third-party callbacks. Razorpay authenticates with an HMAC over
 *                  the raw body, not with a NextAuth cookie, so it can never satisfy
 *                  the session check in `proxy.ts`. Excluding it is what lets a
 *                  captured payment reach its handler instead of being 401'd.
 *   _next/*, favicon.ico, manifest.json, robots.txt, sitemap.xml, *.png, *.css
 *                  fetched by the browser before any session exists
 *
 * `api/signup` is deliberately ABSENT. The public checkout stays gated at the
 * edge until Phase 2 replaces it, because the current implementation mutates a
 * subscription from a client-supplied, unsigned `planId` (analysis 5.1). Phase 2
 * removes that route and re-adds the exclusion on the FastAPI path instead.
 */
export const EDGE_EXCLUDED_PREFIXES = [
  "login",
  "api/auth",
  "api/webhooks",
  "_next/static",
  "_next/image",
  "favicon.ico",
  "manifest.json",
  "robots.txt",
  "sitemap.xml",
] as const;

/** Anything the browser fetches by extension, e.g. a hashed build asset. */
const STATIC_ASSET_PATTERN =
  ".*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|txt|xml)$";

/**
 * Each prefix is terminated by a path-segment boundary, `/` or end of string.
 *
 * Without it the alternation matches on a raw prefix and silently widens the
 * public surface: `api/webhooks` would also exclude `/api/webhooks-internal/...`,
 * and `login` would also exclude `/login-history`. The negative lookahead
 * anchors at the START of the path, so the prefix is already anchored there;
 * this is the half that anchors the END.
 */
const BOUNDARY = "(?:/|$)";

/**
 * Dots inside a prefix are escaped. `favicon.ico` unescaped is a regex wildcard,
 * so `faviconXico` would also be excluded — the same class of silent widening as
 * the missing boundary, one character away.
 */
function escapePrefix(prefix: string): string {
  return prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The negative-lookahead body, shared by the exported matcher and the helper. */
const EXCLUSION_ALTERNATION = [
  ...EDGE_EXCLUDED_PREFIXES.map((prefix) => `${escapePrefix(prefix)}${BOUNDARY}`),
  STATIC_ASSET_PATTERN,
].join("|");

/** Exactly the string Next.js expects in `config.matcher`. */
export const EDGE_MATCHER_PATTERN = `/((?!${EXCLUSION_ALTERNATION}).*)`;

const MATCHER_RE = new RegExp(`^${EDGE_MATCHER_PATTERN}$`);

/**
 * True when the edge gate does NOT apply to `pathname` — that is, when an
 * anonymous request reaches the handler.
 *
 * Derived from the same pattern string the framework uses, so the test and the
 * runtime cannot disagree.
 */
export function isEdgeExcluded(pathname: string): boolean {
  return !MATCHER_RE.test(pathname);
}
