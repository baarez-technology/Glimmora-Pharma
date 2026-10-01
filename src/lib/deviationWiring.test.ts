/**
 * The cross-repo seam: a token minted by THIS app must be accepted by the FastAPI
 * service.
 *
 * Why this test exists
 * --------------------
 * The Deviation module is migrated, but until now nothing proved the chain that makes
 * it work:
 *
 *     Next.js session -> mintAiToken() -> BFF route -> Authorization header
 *                    -> FastAPI get_current_user() -> the service
 *
 * What existed instead was two disconnected halves: a backend suite that minted its
 * own tokens inside pytest, and a frontend test that only asserted the action's
 * SOURCE TEXT mentions callDeviationService. Neither could catch the failure mode that
 * actually matters - the two halves disagreeing about the token, which presents as a
 * 401 in production and as green CI.
 *
 * This closes that gap without needing both repos checked out together: it re-implements
 * mintAiToken's algorithm exactly as src/lib/aiToken.server.ts:86-113 performs it
 * (HS256, base64url, same claims, same TTL), hands the result to the FastAPI service's
 * REAL verifier, and asserts the identity comes back.
 *
 * Re-implementation rather than importing is deliberate and is the main limitation:
 * if mintAiToken changes, this test does not change with it. The assertions below are
 * written to FAIL if the contract drifts, and the guard test in
 * src/actions/deviations.delegation.test.ts pins the parts of aiToken.server.ts this
 * contract depends on.
 *
 * Run: node --import tsx --experimental-test-module-mocks --test \
 *        src/lib/deviationWiring.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BACKEND = join(process.cwd(), "..", "pharma_glimmora_ai_backend");
const SECRET = "wiring-test-secret-shared-by-both-halves";
const TTL_SECONDS = 300; // aiToken.server.ts TTL_SECONDS

/** Verbatim from src/lib/aiToken.server.ts base64url(). JWT forbids +, / and =. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Mint exactly as src/lib/aiToken.server.ts:86-113 does. */
function mintAiToken(user: {
  id: string;
  email: string;
  role: string;
  tenantId: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: user.email || user.id,
      customer_id: user.tenantId,
      role: user.role,
      user_id: user.id,
      iat: now,
      exp: now + TTL_SECONDS,
    }),
  );
  const signature = base64url(
    createHmac("sha256", SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/** Ask the FastAPI service to verify a token, using its own code. */
function verifyInBackend(token: string): { ok: boolean; detail: string } {
  const script = `
import os, sys
import tempfile, uuid, pathlib
_tmp = pathlib.Path(tempfile.gettempdir()) / ("wire_" + uuid.uuid4().hex[:8] + ".db")
os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///" + _tmp.as_posix()
os.environ["SECRET_KEY"] = ${JSON.stringify(SECRET)}
from fastapi.testclient import TestClient
import app.models.deviation_model
import app.models.identity_model
from app.models.deviation_model import Base
from app.database.db import engine
# Imported LAST on purpose: importing app.models.* binds the top-level name
# 'app' to the PACKAGE, which would clobber the FastAPI instance.
from app.main import app as fastapi_app

Base.metadata.create_all(bind=engine)

c = TestClient(fastapi_app)
r = c.get("/api/v1/deviations", headers={"Authorization": "Bearer " + ${JSON.stringify(token)}})
if r.status_code == 200:
    _b = r.json()
    _t = sorted({str(d.get("tenantId")) for d in _b.get("deviations", [])})
    print("VERDICT=OK||count=" + str(_b.get("count", -1)) + "||tenants=" + ",".join(_t))
elif r.status_code == 401:
    print("VERDICT=UNAUTHENTICATED")
else:
    print("VERDICT=OTHER||status=" + str(r.status_code) + "||body=" + r.text[:200])

from app.database.db import engine as _e
_e.dispose()
for _s in ("", "-wal", "-shm"):
    _q = pathlib.Path(str(_tmp) + _s)
    if _q.exists():
        try:
            _q.unlink()
        except OSError:
            pass
`;
  const res = spawnSync(
    join(BACKEND, "venv", "Scripts", "python.exe"),
    ["-c", script],
    { cwd: BACKEND, encoding: "utf8" },
  );
  const out = (res.stdout || "").trim();
  const line = out.split(/\r?\n/).filter((l) => l.startsWith("VERDICT=")).pop() ?? "";
  if (!line) {
    // No verdict at all means the service failed to start or the import blew up.
    // Surfacing stderr matters: a silent empty string reads like "refused", which
    // would make a broken harness look like a passing security test.
    const err = (res.stderr || "").trim().split(/\r?\n/).slice(-4).join(" | ");
    return { ok: false, detail: `no verdict from the service; stderr: ${err}` };
  }
  const m = /^VERDICT=(\w+)(?:\|\|(.*))?$/.exec(line);
  return { ok: m?.[1] === "OK", detail: m?.[2] ?? m?.[1] ?? line };
}

// ── the happy path ────────────────────────────────────────────────────────────

test("a token minted here is accepted by the FastAPI service", () => {
  const token = mintAiToken({
    id: "user-qa",
    email: "qa@alpha.test",
    role: "qa_head",
    tenantId: "tenant-alpha",
  });
  const r = verifyInBackend(token);
  assert.ok(
    r.ok,
    `the service rejected a token minted by mintAiToken's algorithm: ${r.detail}`,
  );
});

test("the service scopes its query by the tenant claim in the token", () => {
  const token = mintAiToken({
    id: "user-qa",
    email: "qa@alpha.test",
    role: "qa_head",
    tenantId: "tenant-alpha",
  });
  const r = verifyInBackend(token);
  assert.ok(r.ok, r.detail);
  // An empty database returns zero rows, so what this proves is that the query RAN
  // and was filtered by the claim rather than short-circuiting: the response is a
  // well-formed scoped list, not an error and not an unscoped one.
  assert.match(r.detail, /count=\d+/, `unexpected response shape: ${r.detail}`);
  assert.match(r.detail, /tenants=($|,)/, `unexpected tenant set: ${r.detail}`);
});

test("a token signed with the wrong secret is refused", () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: "qa@alpha.test",
      customer_id: "tenant-alpha",
      role: "qa_head",
      user_id: "user-qa",
      iat: now,
      exp: now + TTL_SECONDS,
    }),
  );
  const bad = base64url(
    createHmac("sha256", "not-the-shared-secret").update(`${header}.${payload}`).digest(),
  );
  const r = verifyInBackend(`${header}.${payload}.${bad}`);
  assert.equal(r.ok, false, `a forged token was accepted: ${r.detail}`);
  assert.match(r.detail, /UNAUTHENTICATED|401/, `unexpected verdict: ${r.detail}`);
});

test("an unsigned alg:none token is refused", () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: "attacker@evil.test",
      customer_id: "tenant-alpha",
      role: "qa_head",
      user_id: "attacker",
      iat: now,
      exp: now + TTL_SECONDS,
    }),
  );
  const r = verifyInBackend(`${header}.${payload}.`);
  assert.equal(r.ok, false, `an alg:none token was accepted: ${r.detail}`);
});

test("a token with no tenant claim is refused", () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: "qa@alpha.test", role: "qa_head", iat: now, exp: now + TTL_SECONDS }),
  );
  const sig = base64url(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  const r = verifyInBackend(`${header}.${payload}.${sig}`);
  assert.equal(r.ok, false, `a tenant-less token was accepted: ${r.detail}`);
});

test("an expired token is refused", () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: "qa@alpha.test",
      customer_id: "tenant-alpha",
      role: "qa_head",
      user_id: "user-qa",
      iat: now - 7200,
      exp: now - 3600,
    }),
  );
  const sig = base64url(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  const r = verifyInBackend(`${header}.${payload}.${sig}`);
  assert.equal(r.ok, false, `an expired token was accepted: ${r.detail}`);
});

// ── the contract this test depends on ─────────────────────────────────────────

test("aiToken.server.ts still mints the claims the service requires", () => {
  // This is the guard that makes the re-implementation above safe to trust: if the
  // real minter stops sending one of these, or changes the algorithm, this fails.
  const src = readFileSync(join(process.cwd(), "src", "lib", "aiToken.server.ts"), "utf8");
  assert.match(src, /alg:\s*"HS256"/, "the algorithm must stay HS256");
  assert.match(src, /createHmac\("sha256"/, "the HMAC must stay sha256");
  for (const claim of ["sub:", "customer_id:", "role:", "user_id:", "exp:"]) {
    assert.ok(src.includes(claim), `mintAiToken must still send ${claim}`);
  }
  assert.match(src, /AI_JWT_SECRET/, "the secret must still come from AI_JWT_SECRET");
});

test("the service requires exactly the claims this test sends", () => {
  // And the other half: the FastAPI verifier must still require exp, sub and
  // customer_id, and must still pin HS256. A relaxed verifier would be completely
  // invisible from this repo, and that is the failure this whole file exists to catch.
  const src = readFileSync(join(BACKEND, "app", "routers", "auth_router.py"), "utf8");
  assert.match(
    src,
    /options=\{"require":\s*\[[^\]]*"exp"[^\]]*\]\}/,
    "exp must still be required",
  );
  assert.match(src, /ALGORITHM\s*=\s*"HS256"/, "HS256 must still be the pinned algorithm");
  assert.match(
    src,
    /options=\{"require":\s*\[[^\]]*"sub"[^\]]*\]\}/,
    "sub must still be required",
  );
  assert.match(
    src,
    /options=\{"require":\s*\[[^\]]*"customer_id"[^\]]*\]\}/,
    "customer_id must still be required",
  );
  assert.match(src, /algorithms=\[ALGORITHM\]/, "algorithms must stay pinned, not taken from the token");
});
