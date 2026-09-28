import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBackendUrl, BackendUrlMissingError } from "./backendUrl";

/**
 * The AI proxy fell back BACKEND_URL → NEXT_PUBLIC_API_URL → "http://localhost:8000".
 * A production deploy missing BACKEND_URL therefore proxied to localhost, silently:
 * every AI call failed with a connection error and nothing said why. Twelve lines
 * below, the missing-signing-secret path correctly failed closed with 503. Two
 * fail-open and fail-closed rules disagreeing inside one file is the worst place
 * for them to live.
 *
 * The rule is the one the rest of this phase uses: absence of configuration is
 * never permission.
 */
describe("resolveBackendUrl", () => {
  it("uses BACKEND_URL when it is set", () => {
    const url = resolveBackendUrl({
      BACKEND_URL: "http://api.internal:8080",
      NEXT_PUBLIC_API_URL: "https://wrong.example",
      NODE_ENV: "production",
    });
    assert.equal(url, "http://api.internal:8080");
  });

  it("strips a trailing /api from the resolved value", () => {
    const url = resolveBackendUrl({
      BACKEND_URL: "https://api.example.com/api",
      NODE_ENV: "production",
    });
    assert.equal(url, "https://api.example.com");
  });

  it("throws in production when BACKEND_URL is missing", () => {
    // The whole point: a production deploy must not silently proxy to localhost.
    assert.throws(
      () =>
        resolveBackendUrl({
          NEXT_PUBLIC_API_URL: "https://fallback.example/api",
          NODE_ENV: "production",
        }),
      (e: unknown) => {
        assert.ok(e instanceof BackendUrlMissingError, "the error type is wrong");
        assert.match(
          (e as Error).message,
          /BACKEND_URL/,
          "the error must name the variable, not its absence",
        );
        return true;
      },
    );
  });

  it("throws in production even when only NEXT_PUBLIC_API_URL is set", () => {
    // NEXT_PUBLIC_ means "in the browser bundle". Falling back to it here would
    // point a server-side proxy at whatever a client is configured to use.
    assert.throws(
      () =>
        resolveBackendUrl({
          NEXT_PUBLIC_API_URL: "https://api.example.com",
          NODE_ENV: "production",
        }),
      BackendUrlMissingError,
    );
  });

  it("falls back to localhost in development", () => {
    // A local `npm run dev` with no backend running should not require an env var.
    const url = resolveBackendUrl({ NODE_ENV: "development" });
    assert.equal(url, "http://localhost:8000");
  });

  it("does not treat an empty or whitespace-only value as configured", () => {
    for (const value of ["", "   "]) {
      assert.throws(
        () => resolveBackendUrl({ BACKEND_URL: value, NODE_ENV: "production" }),
        BackendUrlMissingError,
        `BACKEND_URL=${JSON.stringify(value)} was treated as configured`,
      );
    }
  });

  it("never echoes a configured URL into its error", () => {
    try {
      resolveBackendUrl({
        BACKEND_URL: "",
        NEXT_PUBLIC_API_URL: "https://x.example",
        NODE_ENV: "production",
      });
      assert.fail("should have thrown");
    } catch (e) {
      assert.doesNotMatch((e as Error).message, /x\.example/);
    }
  });

  it("treats an unrecognised NODE_ENV as production", () => {
    // A typo'd NODE_ENV must not be a way to the localhost fallback. The cast is
    // the point: TypeScript narrows NODE_ENV to a three-value union, but the
    // value arrives as an arbitrary string at runtime.
    const mistyped = { NODE_ENV: "produciton" } as unknown as NodeJS.ProcessEnv;
    assert.throws(() => resolveBackendUrl(mistyped), BackendUrlMissingError);
  });
});
