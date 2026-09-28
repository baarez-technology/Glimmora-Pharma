/**
 * The AI service's base URL, resolved with a rule that fails closed.
 *
 * The proxy used to fall back BACKEND_URL → NEXT_PUBLIC_API_URL →
 * "http://localhost:8000". A production deploy missing BACKEND_URL therefore
 * proxied to localhost, silently: every AI call failed with a connection error,
 * a deployment dashboard showed the web service healthy, and nothing named the
 * variable that was absent. Twelve lines below, the missing-signing-secret path
 * correctly failed closed with 503 — two rules disagreeing inside one file.
 *
 * The rule is the one the backend uses in `app/core/config.py`: absence of
 * configuration is never permission. In development the localhost default stays,
 * because a local `npm run dev` with no backend running should reach a clear
 * connection error rather than a missing-variable one.
 *
 * Called per request, not at module load. Resolving at import time would throw
 * during `next build` in any environment without BACKEND_URL — which is every CI
 * run and every preview deploy, since the variable is only present at runtime.
 */

const LOCAL_FALLBACK = "http://localhost:8000";

export class BackendUrlMissingError extends Error {
  constructor() {
    super(
      "BACKEND_URL is not set. The AI service address is required in production. " +
        "See .do/app.yaml:140-142, which sets it to ${api.PRIVATE_URL}.",
    );
    this.name = "BackendUrlMissingError";
  }
}

export function resolveBackendUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.BACKEND_URL?.trim();
  if (configured) return stripTrailingApi(configured);

  // Anything that is not an explicit development environment is treated as
  // production. A typo'd NODE_ENV must not be a route to the localhost fallback.
  if (env.NODE_ENV === "development") return LOCAL_FALLBACK;

  throw new BackendUrlMissingError();
}

/** The proxy appends its own path segments, so a trailing /api would double up. */
function stripTrailingApi(url: string): string {
  return url.replace(/\/api$/, "");
}
