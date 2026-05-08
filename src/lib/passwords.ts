/**
 * Password / hash cost constants. One canonical location so every
 * bcrypt.hash() call site uses the same work factor — historically a
 * literal `10` was duplicated across actions/settings.ts,
 * actions/tenants.ts, prisma/seed.ts, and the OTP code-hashing path.
 *
 * Why 10: bcrypt's default. ~70-100ms on commodity server hardware,
 * fast enough that login throughput stays comfortable while slow
 * enough to be hostile to offline brute-force. Bump to 12 once
 * average login latency budget allows the extra ~250ms.
 */
export const BCRYPT_COST = 10;
