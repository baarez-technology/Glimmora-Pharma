/**
 * Per-tenant per-year reference allocator. Generates strings like
 * "CAPA-2026-014" or "CC-2026-003" by reading the highest existing
 * reference for the tenant + prefix + year, parsing its trailing
 * sequence number, and adding 1.
 *
 * Pure helper — does no Prisma access itself. The caller passes a count
 * callback that runs inside the calling transaction so the count + insert
 * happen atomically. The caller is also responsible for the retry-on-P2002
 * loop: race-safe sequence allocation requires it because two concurrent
 * inserts can read the same count and both compute the same reference.
 *
 * Cross-tenant note: the reference column on both CAPA and ChangeControl
 * is globally @unique (not @@unique([tenantId, reference])) to keep the
 * SQLite index simple. The per-tenant count means tenant A's first CC in
 * 2026 and tenant B's first CC in 2026 both compute "CC-2026-001" — one
 * succeeds, the other gets P2002 and the caller's retry loop bumps its
 * own count to 2. End state: each tenant's references are approximately
 * sequential, gaps possible across cross-tenant collisions.
 *
 * Why max-based, not count-based: count() over rows whose createdAt falls
 * inside the current year can disagree with the existing reference values
 * for that year (seed data, manual inserts, or rows whose createdAt was
 * back-dated for any reason). Counting 0 while CAPA-2026-001 already
 * exists guarantees P2002 on every attempt and the retry loop converges
 * on the same dead value. Reading the max reference of the tenant for
 * the year is independent of createdAt, so the next number is always
 * strictly above any existing one.
 */
export async function generateReference(
  prefix: string,
  now: Date,
  findLatestForYear: (prefix: string, year: number) => Promise<string | null>,
): Promise<string> {
  const year = now.getUTCFullYear();
  const latest = await findLatestForYear(prefix, year);
  let nextNum = 1;
  if (latest) {
    // Trailing run of digits — tolerant of any future "-XYZ" suffix
    // formats while still parsing today's "-NNN" cleanly.
    const m = latest.match(/-(\d+)$/);
    if (m) {
      const parsed = Number.parseInt(m[1], 10);
      if (Number.isFinite(parsed)) nextNum = parsed + 1;
    }
  }
  return `${prefix}-${year}-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Helper that detects the specific Prisma error indicating a unique
 * constraint collision on the `reference` column. Use to decide whether
 * to retry or rethrow inside the caller's create loop.
 */
export function isReferenceConflict(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: string[] } } | null;
  return e?.code === "P2002" && (e?.meta?.target?.includes("reference") ?? false);
}
