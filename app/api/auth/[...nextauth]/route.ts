import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateOtp, verifyOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mailer";

/**
 * Production guard for NEXTAUTH_SECRET (audit findings 3.6 + 11.3).
 *
 * Called inside authorize() so it fires at request-time, not at module
 * evaluation — Next.js build does not have runtime secrets available and
 * would crash during page-data collection if this ran at the top level.
 */
const PLACEHOLDER_SECRET = "replace-with-a-32-byte-base64-secret";
function assertProductionSecret(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error("NEXTAUTH_SECRET must be set in production.");
  }
  if (process.env.NEXTAUTH_SECRET === PLACEHOLDER_SECRET) {
    throw new Error(
      "NEXTAUTH_SECRET is still set to the .env.example placeholder. " +
        "Generate a real secret with: openssl rand -base64 32",
    );
  }
  if (process.env.NEXTAUTH_SECRET.length < 32) {
    throw new Error("NEXTAUTH_SECRET must be at least 32 characters.");
  }
}

/**
 * NextAuth — Credentials provider backed by Prisma SQLite.
 *
 * Lookup order:
 *   1. Tenant table (super_admin / customer_admin) — by email.
 *   2. User table   (qa_head, regulatory_affairs, etc.) — by email.
 *
 * Subscription gate: blocks login when the tenant has no active or
 * non-expired subscription, EXCEPT for super_admin (they are the ones
 * who renew billing). When blocked we throw `SUBSCRIPTION_INACTIVE`
 * so the client can show a specific message.
 *
 * MFA: tenant-level. If Tenant.mfaEnabled is true, every login from that
 * tenant (Tenant-row OR User-row) is gated by an emailed OTP — except
 * super_admin, which always bypasses.
 *
 * Errors thrown to the client (via `result.error` on signIn):
 *   - SUBSCRIPTION_INACTIVE   — tenant has no active sub
 *   - AMBIGUOUS_EMAIL         — multiple Tenant or User rows match the
 *                               same email; refuse to silently pick one
 *   - OTP_REQUIRED            — credentials valid; OTP issued + emailed
 *   - OTP_INVALID             — wrong code
 *   - OTP_EXPIRED             — code older than 10 minutes
 *   - OTP_LOCKED              — 5 wrong attempts; resend required
 *   - OTP_NO_OTP              — no live code on file; resend required
 */

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  tenantId: string;
  orgId: string;
  siteId?: string | null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "Verification code", type: "text" },
      },
      async authorize(credentials) {
        assertProductionSecret();
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();
        const password = credentials.password;
        const otp = credentials.otp?.trim() ?? "";

        try {
          // ── Path 1: Tenant table (super_admin / customer_admin) ──
          // findMany + length guard: refuse to silently pick one when the
          // unique constraint is violated (shouldn't happen — Tenant.email
          // and Tenant.username are both @@unique — but the guard makes the
          // failure mode loud).
          // Accept either email or username (e.g. "superadmin"). When the
          // input has no "@" we treat it as a username; otherwise email.
          const isEmail = email.includes("@");
          const tenantMatches = await prisma.tenant.findMany({
            where: isEmail ? { email } : { username: email },
            include: { subscription: true },
          });
          if (tenantMatches.length > 1) {
            throw new Error("AMBIGUOUS_EMAIL");
          }
          const tenant = tenantMatches[0];

          if (tenant) {
            if (!tenant.isActive) return null;

            const valid = await bcrypt.compare(password, tenant.passwordHash);
            if (!valid) return null;

            // Subscription gate — super_admin bypasses; customer_admin still
            // checks because lapsed tenants should not be able to use the app.
            if (tenant.role !== "super_admin") {
              const sub = tenant.subscription;
              const hasActiveSub =
                !!sub &&
                sub.status?.toLowerCase() === "active" &&
                new Date(sub.expiryDate) > new Date();
              if (!hasActiveSub && tenant.role !== "customer_admin") {
                throw new Error("SUBSCRIPTION_INACTIVE");
              }
            }

            // ── MFA gate ──
            // super_admin always bypasses MFA. For everyone else (customer_admin
            // here in the Tenant path), gate on Tenant.mfaEnabled.
            if (tenant.role !== "super_admin" && tenant.mfaEnabled) {
              if (!otp) {
                const code = await generateOtp(email, null);
                await sendOtpEmail(tenant.email, code);
                throw new Error("OTP_REQUIRED");
              }
              const v = await verifyOtp(email, null, otp);
              if (!v.ok) {
                throw new Error(`OTP_${v.reason.toUpperCase()}`);
              }
            }

            const result: SessionUser = {
              id: tenant.id,
              name: tenant.name,
              email: tenant.email,
              role: tenant.role,
              gxpSignatory: false,
              tenantId: tenant.id,
              orgId: tenant.id,
              siteId: null,
            };
            return result as unknown as SessionUser;
          }

          // ── Path 2: User table (site users) ──
          // Same ambiguity guard. User.email is unique only within a tenant
          // (@@unique([tenantId, email])), so cross-tenant duplicates are
          // structurally possible — refuse rather than guess.
          // Accept username as well: User.username also has @@unique with
          // tenantId, so the same ambiguity guard applies.
          const userMatches = await prisma.user.findMany({
            where: isEmail ? { email } : { username: email },
            include: { tenant: { include: { subscription: true } } },
          });
          if (userMatches.length > 1) {
            throw new Error("AMBIGUOUS_EMAIL");
          }
          const user = userMatches[0];

          if (user) {
            if (!user.isActive) return null;

            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return null;

            const sub = user.tenant?.subscription;
            const hasActiveSub =
              !!sub &&
              sub.status?.toLowerCase() === "active" &&
              new Date(sub.expiryDate) > new Date();
            if (!hasActiveSub) {
              throw new Error("SUBSCRIPTION_INACTIVE");
            }

            // ── MFA gate (User path) ──
            // Tenant.mfaEnabled lives on the parent Tenant row.
            if (user.tenant?.mfaEnabled) {
              if (!otp) {
                const code = await generateOtp(email, user.tenantId);
                await sendOtpEmail(user.email, code);
                throw new Error("OTP_REQUIRED");
              }
              const v = await verifyOtp(email, user.tenantId, otp);
              if (!v.ok) {
                throw new Error(`OTP_${v.reason.toUpperCase()}`);
              }
            }

            await prisma.user.update({
              where: { id: user.id },
              data: { lastLogin: new Date() },
            });

            const result: SessionUser = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              gxpSignatory: user.gxpSignatory,
              tenantId: user.tenantId,
              orgId: user.tenantId,
              siteId: user.siteId,
            };
            return result as unknown as SessionUser;
          }

          return null;
        } catch (err) {
          if (err instanceof Error) {
            // Bubble up specific signals the client UI handles explicitly.
            if (
              err.message === "SUBSCRIPTION_INACTIVE" ||
              err.message === "AMBIGUOUS_EMAIL" ||
              err.message === "OTP_REQUIRED" ||
              err.message === "OTP_INVALID" ||
              err.message === "OTP_EXPIRED" ||
              err.message === "OTP_LOCKED" ||
              err.message === "OTP_NO_OTP"
            ) {
              throw err;
            }
          }
          console.error("[auth] authorize failed:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const su = user as unknown as SessionUser;
        token.id = su.id;
        token.role = su.role;
        token.gxpSignatory = su.gxpSignatory;
        token.tenantId = su.tenantId;
        token.orgId = su.orgId;
        token.siteId = su.siteId ?? null;
      }

      // ── MFA session-invalidation enforcement ──
      // On every JWT decode (= every authenticated request that touches the
      // session), compare the token's iat against the parent tenant's
      // sessionsValidAfter. If the tenant's MFA flag was flipped on after
      // this token was issued, sessionsValidAfter > token.iat and we return
      // an empty token, which middleware/getServerSession see as no session
      // and redirect to /login.
      //
      // This adds one Prisma read per authenticated request. Acceptable for
      // a multi-tenant SaaS at this scale; revisit with a cache if needed.
      // The check lives here (Pages Router = Node runtime) because Edge
      // middleware can't import the Prisma client.
      const tenantId = token.tenantId as string | undefined;
      const iat = typeof token.iat === "number" ? token.iat : undefined;
      if (tenantId && iat) {
        try {
          const t = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { sessionsValidAfter: true },
          });
          if (t && iat * 1000 < t.sessionsValidAfter.getTime()) {
            return {} as typeof token;
          }
        } catch (err) {
          // Don't fail-open on a transient DB hiccup — log and let the
          // existing token through. The next request will retry.
          console.error("[auth] sessionsValidAfter check failed:", err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as Record<string, unknown>;
        u.id = token.id;
        u.role = token.role;
        u.gxpSignatory = token.gxpSignatory;
        u.tenantId = token.tenantId;
        u.orgId = token.orgId;
        u.siteId = token.siteId ?? null;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
};

// App Router: NextAuth's handler is the GET + POST handler for this route.
// v4.22+ supports the route.ts shape — Next.js 16 stopped discovering the
// catch-all in pages/api/, so this is now the canonical location.
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
