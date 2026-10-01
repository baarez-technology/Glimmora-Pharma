/**
 * BFF route for the Deviation domain.
 *
 * WHY THIS EXISTS
 * ---------------
 * The browser must never hold a credential for the FastAPI service, and the service
 * has no session to read. So the request crosses a boundary where identity is
 * re-established from a token only this app can mint — the same boundary the AI proxy
 * already implements (app/api/ai-proxy/[...path]/route.ts).
 *
 * All the security-relevant behaviour lives in src/lib/api/deviation.server.ts, which
 * this route and the server actions share. Duplicating the mint-and-fail-closed logic
 * here would give it two places to rot, and "fails closed when no token can be
 * minted" is a security property: an unauthenticated request that reaches the service
 * is accepted as a shared `anonymous` identity, which poisons the audit trail. On a
 * regulated WRITE surface that is worse, because the service actually mutates rows.
 *
 * WHAT IS DIFFERENT FROM THE AI PROXY, deliberately
 * --------------------------------------------------
 *   - No AGI policy gate. AGENT_PATHS governs ADVICE features. A regulated record
 *     transition is not advice and must not be switchable off by a tenant toggle.
 *   - An explicit method allowlist. The AI proxy forwards five verbs generically; a
 *     write surface should enumerate what it accepts.
 *   - Refusals pass through with their status and body. The service returns a stable
 *     `code` next to the human message and the client branches on the code; collapsing
 *     that into a generic 500 would destroy the only thing that lets a caller tell
 *     "not ready to close" from "wrong password".
 */
import { auth } from "@/lib/auth";
import { callDeviationService, isValidResourceId } from "@/lib/api/deviation.server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_METHODS = new Set(["GET", "POST"]);

/** The service emits camelCase (app/schemas/deviation.py), which is the shape the
 *  frontend already consumes, so no translation happens here. */
async function proxy(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const method = req.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json(
      { error: `Method ${method} is not allowed on this resource` },
      { status: 405 },
    );
  }

  const { path = [] } = await ctx.params;
  for (const segment of path) {
    if (!isValidResourceId(segment)) {
      return NextResponse.json({ error: "Malformed resource id" }, { status: 400 });
    }
  }

  // Read the body once. A POST with no body is legitimate (startInvestigation), so an
  // empty string must become undefined rather than "".
  let body: unknown;
  if (method === "POST") {
    const raw = await req.text();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
      }
    }
  }

  try {
    const data = await callDeviationService({
      method: method as "GET" | "POST",
      path,
      body,
      search: new URL(req.url).search,
      session,
    });
    return NextResponse.json(data, {
      // The service is the only writer for these rows; the browser must never be
      // handed a cached copy of a regulated record.
      headers: { "Cache-Control": "private, no-store, must-revalidate" },
    });
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = err.status ?? 500;
    return NextResponse.json(
      {
        // Both shapes are emitted: `detail` for the typed client (which reads
        // detail.code/message) and `error` for anything else reading the BFF body.
        detail: { code: err.code ?? "UNKNOWN", message: err.message ?? "Request failed." },
        error: err.message ?? "Request failed.",
      },
      { status, headers: { "Cache-Control": "private, no-store, must-revalidate" } },
    );
  }
}

export const GET = proxy;
export const POST = proxy;