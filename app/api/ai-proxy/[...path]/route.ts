import { NextRequest } from "next/server";

const AI_BASE = "https://pharma-glimmora-ai-backend.onrender.com";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${AI_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const buf = await req.arrayBuffer();
    body = buf.byteLength ? buf : undefined;
  }
  let res: Response;
  try {
    res = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
  } catch (err) {
    return new Response(JSON.stringify({ detail: `Proxy error: ${(err as Error).message}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
  const respHeaders = new Headers(res.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  // Lifecycle by-capa lookups (rca|action-plan|monitoring|effectiveness|closure)/capa/{id}
  // 404 when the stage hasn't been submitted yet. Surface that as 204 No Content so the
  // browser doesn't log it as an error in dev tools. The client treats both as "not started".
  if (
    res.status === 404 &&
    req.method === "GET" &&
    /^api\/v1\/(rca|action-plan|monitoring|effectiveness|closure)\/capa\//i.test(path.join("/"))
  ) {
    return new Response(null, { status: 204, headers: respHeaders });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: respHeaders });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
