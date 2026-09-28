import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Next ships this as CommonJS, so it is reached through the default export.
import pathToRegexp from "next/dist/compiled/path-to-regexp";

import { EDGE_MATCHER_PATTERN, isEdgeExcluded } from "./proxyMatcher";

/**
 * The edge gate is defense-in-depth, but today it is the only thing standing
 * between an anonymous request and a payment route, so its matcher is pinned
 * here. `isEdgeExcluded` answers one question: does the edge gate apply here? A
 * path is reachable without a session exactly when it is EXCLUDED.
 */
describe("edge matcher", () => {
  it("lets a Razorpay callback through — it carries an HMAC, not a cookie", () => {
    assert.equal(isEdgeExcluded("/api/webhooks/razorpay"), true);
  });

  it("still gates the public checkout, which accepts an unsigned client plan", () => {
    for (const p of [
      "/api/signup/pricing",
      "/api/signup/initiate",
      "/api/signup/create-order",
      "/api/signup/verify-payment",
    ]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must stay gated`);
    }
  });

  it("gates authenticated subscription routes", () => {
    for (const p of [
      "/api/subscriptions/status",
      "/api/subscriptions/renew",
      "/api/subscriptions/verify-renewal",
      "/api/ai-proxy/v1/ai/assistant",
    ]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must stay gated`);
    }
  });

  it("leaves NextAuth and the sign-in page reachable", () => {
    for (const p of ["/login", "/api/auth/session", "/api/auth/callback/credentials"]) {
      assert.equal(isEdgeExcluded(p), true, `${p} must be reachable`);
    }
  });

  it("leaves pre-session browser fetches reachable", () => {
    for (const p of [
      "/favicon.ico",
      "/manifest.json",
      "/robots.txt",
      "/sitemap.xml",
      "/_next/static/chunk.js",
      "/_next/image",
      "/logo.png",
      "/styles.css",
    ]) {
      assert.equal(isEdgeExcluded(p), true, `${p} must not be gated`);
    }
  });

  it("gates every application page", () => {
    for (const p of ["/dashboard", "/admin", "/settings", "/deviations"]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must be gated`);
    }
  });

  it("does not exclude a path that merely contains an excluded prefix", () => {
    // The negative lookahead anchors at the START of the path segment. A
    // substring match here would open /api/authenticated/* to the public.
    for (const p of ["/api/webhooks-fake/razorpay", "/api/authenticated/x", "/login-history"]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must be gated`);
    }
  });

  it("does not treat a dot in a prefix as a wildcard", () => {
    // `favicon.ico` unescaped is a regex wildcard, so `faviconXico` would be
    // excluded too — the same silent widening as a missing path boundary.
    for (const p of ["/faviconXico", "/robotsXtxt", "/sitemapXxml", "/manifestXjson"]) {
      assert.equal(isEdgeExcluded(p), false, `${p} must be gated`);
    }
  });
});

/**
 * `proxy.ts` must hold the matcher as a STRING LITERAL, because Next.js
 * extracts `config.matcher` at build time and does not resolve imported
 * identifiers. An imported constant registers no matcher at all: the proxy then
 * runs for every request and every public route silently 401s, which is the
 * failure this file's sibling test cannot see.
 *
 * So the pattern exists twice — once as the tested definition here, once as the
 * literal the framework reads — and this block is what stops them drifting.
 */
describe("proxy.ts matcher literal", () => {
  const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

  it("writes the matcher as a literal rather than importing it", () => {
    assert.match(
      source,
      /matcher:\s*\[\s*"\//,
      "proxy.ts must inline the matcher string; Next.js does not resolve an " +
        "imported identifier in config.matcher",
    );
    assert.doesNotMatch(
      source,
      /import\s+\{[^}]*EDGE_MATCHER_PATTERN[^}]*\}\s+from/,
      "proxy.ts must not import EDGE_MATCHER_PATTERN — it would register no matcher",
    );
  });

  it("matches the tested definition byte for byte", () => {
    // The source text of a double-quoted TS string carries its own escapes
    // (`\\.` in the file is `\.` at runtime), so the literal is evaluated the way
    // the engine evaluates it before being compared to the export.
    const raw = source.match(/matcher:\s*\[\s*"((?:[^"\\]|\\.)*)"/s)?.[1];
    assert.ok(raw, "could not read the matcher literal out of proxy.ts");
    const literal = JSON.parse(`"${raw}"`) as string;
    assert.equal(
      literal,
      EDGE_MATCHER_PATTERN,
      "the literal in proxy.ts has drifted from EDGE_MATCHER_PATTERN. Next.js reads " +
        "the literal; the test reads the export. Update both, and read the comment " +
        "above the matcher in proxy.ts for why there are two copies.",
    );
  });

  it("compiles to the same decisions under Next's own matcher compiler", () => {
    // The unit test above exercises this module's regex. What actually gates
    // traffic is the regex Next builds from the literal, through
    // path-to-regexp. Assert the two agree, or a pattern can test green here
    // and behave differently in production.
    const compiled = pathToRegexp.pathToRegexp(EDGE_MATCHER_PATTERN) as unknown as RegExp;
    for (const p of [
      "/api/webhooks/razorpay",
      "/api/signup/pricing",
      "/api/auth/session",
      "/api/authenticated/x",
      "/login",
      "/login-history",
      "/logo.png",
      "/dashboard",
    ]) {
      assert.equal(
        compiled.test(p),
        !isEdgeExcluded(p),
        `Next compiles the matcher to disagree with isEdgeExcluded for ${p}`,
      );
    }
  });
});
