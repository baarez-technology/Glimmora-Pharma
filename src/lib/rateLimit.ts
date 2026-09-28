/**
 * In-process request limiting for the public Next.js routes.
 *
 * There was none. `app/api/signup/initiate` is unauthenticated and hashes at
 * bcrypt cost 12 on every call, and the NextAuth credentials provider ran
 * `bcrypt.compare` with no limit in front of it. Both are CPU-amplification
 * levers on routes anyone can reach.
 *
 * LIMITATION, stated rather than assumed: this store is per Node process. On
 * DigitalOcean App Platform the `web` service runs `instance_count: 1`
 * (`.do/app.yaml:105`), so the effective limit matches the configured number. A
 * multi-instance deployment multiplies every limit by the instance count, and a
 * restart resets every budget. Redis is the correct store when that changes.
 *
 * The key is supplied by the caller, not derived here, so the same limiter can
 * be keyed by IP for anonymous routes and by IP+identifier for login — a
 * username-keyed limit alone would let anyone lock an account out, which is
 * exactly the defect the FastAPI lockout carried when it was deleted.
 */

const store = new Map<string, number[]>();

/** Hard ceiling on tracked keys. Without it, a key flood exhausts memory. */
const MAX_TRACKED_KEYS = 10_000;

/** Longest window accepted, so a caller cannot pin every key forever. */
const WINDOW_CEILING_MS = 24 * 60 * 60 * 1000;

export interface ConsumeResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/** Test and diagnostics helper. */
export function trackedKeys(): number {
  return store.size;
}

/**
 * Drop every key whose window has fully expired. Returns the number removed.
 *
 * Without this the store only ever grows until MAX_TRACKED_KEYS evicts in
 * insertion order, which means a burst of one-off keys can evict a legitimate
 * long-lived key and silently un-limit it.
 */
export function sweepRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [key, stamps] of store) {
    const kept = stamps.filter((t) => now - t < WINDOW_CEILING_MS);
    if (kept.length === 0) store.delete(key);
    else store.set(key, kept);
    removed += 1;
  }
  return removed;
}

/** Clear everything. Tests and administrative use. */
export function resetRateLimits(): void {
  store.clear();
}

/**
 * Record one request against `key`. Returns whether it was allowed and, when it
 * was not, how long to wait.
 *
 * A denied request is NOT recorded. Recording it would let a client that keeps
 * hammering extend its own lockout indefinitely.
 */
export function consume(key: string, limit: number, windowMs: number): ConsumeResult {
  const now = Date.now();
  const window = Math.max(1, Math.min(windowMs, WINDOW_CEILING_MS));

  const stamps = (store.get(key) ?? []).filter((t) => now - t < window);

  if (stamps.length >= limit) {
    // The oldest stamp in the window plus the window is when a slot frees up.
    const retryAfterMs = Math.max(0, Math.min(...stamps) + window - now);
    store.set(key, stamps);
    return { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  stamps.push(now);
  store.set(key, stamps);

  if (store.size > MAX_TRACKED_KEYS) {
    // Map preserves insertion order, so the first keys are the oldest.
    const overflow = store.size - MAX_TRACKED_KEYS;
    let dropped = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++dropped >= overflow) break;
    }
  }

  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * The caller's address, preferring the proxy's forwarded value.
 *
 * On DigitalOcean the request reaches Next.js through the platform's proxy, so
 * `x-forwarded-for` is set by infrastructure rather than by the client. If it is
 * absent the connection's own address is used. A caller that can spoof this can
 * rotate its key, so the fallback matters and is why the limiter is a cost
 * backstop rather than the only control.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
