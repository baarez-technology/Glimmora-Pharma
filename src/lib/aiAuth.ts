/**
 * Where AI calls are addressed.
 *
 * In the browser this is ALWAYS the same-origin proxy at
 * `app/api/ai-proxy/[...path]`. The proxy checks the NextAuth session, mints the
 * upstream access token server-side, and forwards the call. So the browser never
 * learns the AI service's address and never carries a credential for it.
 *
 * There is deliberately no `NEXT_PUBLIC_AI_API_URL` escape hatch any more: it
 * let a deployment point client-side fetches straight at the AI service, which
 * bypassed the session check and the token injection in one step.
 *
 * Server-side callers (server actions, route handlers) go direct to the
 * upstream — they are already inside the trust boundary and have no proxy to
 * route through. They resolve the address with the SAME rule the proxy uses:
 * `resolveBackendUrl`, which fails closed. This function used to be its own,
 * looser resolver — `BACKEND_URL ?? NEXT_PUBLIC_API_URL ?? localhost:8000` —
 * so a production deploy missing BACKEND_URL sent the BFF routes to localhost,
 * every call failed with a connection error, and nothing named the variable
 * that was absent. Two rules disagreeing about the same setting is the defect;
 * there is now one.
 *
 * Signup/login against the AI service are NOT here. NextAuth is the only
 * identity issuer, and the AI service registers no auth routes at all — see
 * `app/routers/auth_router.py` in the backend, whose header documents this.
 */

import { resolveBackendUrl, BackendUrlMissingError } from "./backendUrl";

/** Same-origin proxy path. Every browser AI request goes through this. */
export const AI_PROXY_PATH = "/api/ai-proxy";

export { BackendUrlMissingError };

/**
 * Direct upstream base for server-side callers.
 *
 * THROWS `BackendUrlMissingError` when the address cannot be resolved, which in
 * any non-development environment means BACKEND_URL is unset. Callers already
 * wrap this in the same try/catch that wraps the fetch, and several already
 * have a 503 "not configured" branch beside the call — prefer that, using
 * `resolveUpstreamOrNull`, so a missing variable is not reported as an
 * unreachable host.
 */
export function aiUpstreamBase(): string {
  return resolveBackendUrl(process.env);
}

/**
 * Non-throwing form, for call sites that want to answer 503 "not configured"
 * rather than let the error surface as a 502 "unreachable".
 */
export function resolveUpstreamOrNull(): string | null {
  try {
    return resolveBackendUrl(process.env);
  } catch {
    return null;
  }
}

/**
 * The base a caller should fetch from, for the current runtime.
 *
 * A function, not a constant, and that is the point. It used to be computed at
 * module load, which meant resolving the upstream address during `next build` —
 * in any environment without BACKEND_URL, which is every CI run and every
 * preview deploy, since the variable is only present at runtime. Resolving per
 * call keeps the build independent of deployment configuration.
 *
 * It is also now safe to reach from a Server Component. The old server-side
 * branch produced the bare upstream host, and `aiBackend.request()` attaches no
 * auth header of its own (the proxy mints one), so a server-side call would have
 * gone out unauthenticated and 401'd. Prefer a route handler.
 */
export function aiApiBase(): string {
  return typeof window === "undefined" ? aiUpstreamBase() : AI_PROXY_PATH;
}

export class AiAuthError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/* ── Helpers for ID generation ─────────────────────────────────── */

/**
 * Generates a USER-XXXX style id, used as a suffix to keep a generated
 * `username` unique when the email's local part is under 3 characters.
 *
 * `generateCustomerId` and the `AiSignupRequest` / `AiAuthResponse` shapes
 * used to live here too. All three existed only to provision a matching user on
 * the AI service, and that endpoint — POST /api/v1/auth/signup — has since been
 * deleted: NextAuth is the sole identity issuer, and the AI service registers no
 * auth routes. They were removed rather than left exported, because an exported
 * type describing a dead request is an invitation to call it again.
 */
export function generateUserId(): string {
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `USER-${rand}`;
}
