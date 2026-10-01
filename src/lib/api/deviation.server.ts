/**
 * Server-side transport for the Deviation service.
 *
 * ONE implementation of "mint a token, call the service, normalise the error", used by
 * BOTH the browser-facing route (app/api/deviation/[...path]/route.ts) and the server
 * actions (src/actions/deviations.ts). Two copies of the fail-closed logic would be
 * two places for it to rot, and the fail-closed behaviour is a security property, not
 * a convenience: an unauthenticated request that reaches the service is accepted as a
 * shared `anonymous` identity and poisons the audit trail.
 *
 * WHY SERVER CODE CALLS THE UPSTREAM DIRECTLY
 * --------------------------------------------
 * A server action has no base URL, so it cannot fetch a relative `/api/...` path. It
 * resolves the service address and attaches the minted token itself. This is the same
 * arrangement src/lib/aiAuth.ts uses for the AI surface (aiApiBase() returns the
 * upstream on the server and the proxy path in the browser), so there is one
 * established pattern rather than two.
 *
 * The browser still goes through the BFF. This path is never reachable from client
 * code: it imports server-only modules and is named `.server.ts`.
 */
import "server-only";

import { canMintAiToken, mintAiToken } from "@/lib/aiToken.server";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { auth, type AuthSession } from "@/lib/auth";

export type DeviationServiceError = {
  /** HTTP status from the service. 0 means the service was never reached. */
  status: number;
  /** Stable machine code, e.g. DEVIATION_NOT_READY. Callers branch on this. */
  code: string;
  /** Human message, already suitable for display. */
  message: string;
};

/**
 * Raised when the service cannot be reached or is misconfigured. Distinguished from a
 * business refusal because the remedy is different: this is an operator problem, not
 * something the user can fix by changing their input.
 */
export class DeviationServiceUnavailableError extends Error {
  readonly status = 503;
  readonly code = "DEVIATION_SERVICE_UNAVAILABLE";
  constructor(message = "The Deviation service is unavailable.") {
    super(message);
    this.name = "DeviationServiceUnavailableError";
  }
}

/** Parse the service's problem body. Returns null when it is not the shape we expect,
 *  in which case the caller falls back to the raw status. */
function parseProblem(body: unknown): { code: string; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const outer = body as { detail?: unknown; code?: unknown; message?: unknown };
  const inner =
    outer.detail && typeof outer.detail === "object" && !Array.isArray(outer.detail)
      ? (outer.detail as { code?: unknown; message?: unknown })
      : outer;
  const code = typeof inner.code === "string" ? inner.code : null;
  const message = typeof inner.message === "string" ? inner.message : null;
  if (code && message) return { code, message };
  return null;
}

/** A cuid-shaped id check. The service validates too; doing it here turns a
 *  caller-supplied traversal attempt into a 400 at the edge of our own code. */
export function isValidResourceId(segment: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(segment);
}

type CallOptions = {
  method: "GET" | "POST";
  /** Path segments AFTER /api/v1/deviations, e.g. ["abc", "close"]. */
  path?: string[];
  body?: unknown;
  search?: string;
  session?: AuthSession;
};

/**
 * Call the Deviation service as `session`.
 *
 * Returns the parsed JSON on 2xx. On any other outcome it THROWS a
 * `DeviationServiceError`, so a caller can never accidentally treat a refusal as a
 * success - the failure mode where a regulated write silently no-ops.
 */
export async function callDeviationService<T>(opts: CallOptions): Promise<T> {
  const session = opts.session ?? (await auth());
  if (!session?.user) {
    const e = new Error("Not authenticated") as Error & DeviationServiceError;
    e.status = 401;
    e.code = "UNAUTHENTICATED";
    e.message = "Not authenticated.";
    throw e;
  }

  // Fail closed BEFORE resolving an address, so a misconfiguration is reported as
  // "not configured" rather than as an unreachable-host error that reads like a
  // network fault and sends an operator to the wrong place.
  if (!canMintAiToken()) {
    throw new DeviationServiceUnavailableError(
      "Deviation service is not configured (AI_JWT_SECRET missing).",
    );
  }

  let upstream: string;
  try {
    upstream = resolveBackendUrl(process.env);
  } catch {
    throw new DeviationServiceUnavailableError(
      "Deviation service is not configured (BACKEND_URL missing).",
    );
  }

  const segments = opts.path ?? [];
  for (const segment of segments) {
    if (!isValidResourceId(segment)) {
      const e = new Error("Malformed resource id") as Error & DeviationServiceError;
      e.status = 400;
      e.code = "MALFORMED_RESOURCE_ID";
      e.message = "Malformed resource id.";
      throw e;
    }
  }

  const target = new URL(
    `/api/v1/deviations${segments.length ? `/${segments.join("/")}` : ""}`,
    upstream,
  );
  if (opts.search) target.search = opts.search;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${mintAiToken(session)}`,
    // Informational only. The service reads the tenant from the signed claim and
    // ignores this; it exists so a request log can attribute a line without decoding
    // the token, and a mismatch is worth alerting on.
    "X-Tenant-Id": session.user.tenantId ?? "",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      // Surface an upstream 3xx rather than following it. A redirect on a regulated
      // write should be visible, not silently chased.
      redirect: "manual",
    });
  } catch {
    throw new DeviationServiceUnavailableError();
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const problem = parseProblem(parsed);
    const e = new Error(problem?.message ?? `Request failed (${res.status})`) as Error &
      DeviationServiceError;
    e.status = res.status;
    e.code = problem?.code ?? `HTTP_${res.status}`;
    e.message = problem?.message ?? e.message;
    throw e;
  }

  return parsed as T;
}