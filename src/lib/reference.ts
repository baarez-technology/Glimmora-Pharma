/**
 * Per-tenant per-year reference allocator. Generates strings like
 * "CAPA-2026-014" or "CC-2026-003" by counting how many records of the
 * caller's type exist for the tenant in the current year.
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
 */
export async function generateReference(
  prefix: string,
  now: Date,
  countInYear: (yearStart: Date, yearEnd: Date) => Promise<number>,
): Promise<string> {
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const count = await countInYear(yearStart, yearEnd);
  return `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`;
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
