/**
 * Regenerate dev-credentials.local.json from the ACTUAL database.
 *
 *   npx tsx scripts/gen-dev-credentials.ts
 *
 * Why this exists: the login page's Developer Credentials panel was hand-written
 * and drifted from the seed — it listed 9 of 24 accounts and used four role
 * labels the app does not use. Anything hand-maintained against a database will
 * drift again, so it is generated instead. Re-run it after `npm run db:seed` or
 * any change to the seeded users.
 *
 * WHERE THE PASSWORDS COME FROM: this script does not contain any. Passwords
 * cannot be recovered from a bcrypt hash, so the candidates are parsed out of
 * the `bcrypt.hash("…")` literals already present in prisma/seed.ts — a tracked
 * file — and then each one is verified against every account's stored hash. No
 * new secret is introduced anywhere, and an account whose password is not one of
 * the seed's own literals is reported rather than guessed at.
 *
 * The OUTPUT (dev-credentials.local.json) is gitignored. This generator is not:
 * it holds no credentials.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const ROOT = process.cwd();

/** Chip colour per role slug. Keyed by the STORED role, not a display label, so
 *  renaming a label in src/lib/labels/roles.ts cannot orphan a colour. */
const ROLE_COLOUR: Record<string, string> = {
  super_admin: "#ef4444",
  customer_admin: "#8b6914",
  qa_head: "#a78bfa",
  qa: "#818cf8",
  regulatory_affairs: "#fb923c",
  csv_val_lead: "#38bdf8",
  qc_lab_director: "#10b981",
  it_cdo: "#06b6d4",
  operations_head: "#84cc16",
  viewer: "#94a3b8",
};
const FALLBACK_COLOUR = "#94a3b8";

/** Plan tier → the words the login panel shows beside the tenant name. */
const TIER_NOTE: Record<string, string> = {
  ESSENTIALS: "Essentials tier — 25 users, 3 sites.",
  PROFESSIONAL: "The demo tenant — all seeded records live here.",
  ENTERPRISE: "Enterprise tier — 250 users, 30 sites.",
  TAILORED: "Tailored plan — custom caps, frozen at purchase.",
};

/** Pull every password literal out of the seed's bcrypt.hash(...) calls. */
function seedPasswordCandidates(): string[] {
  const seed = readFileSync(path.join(ROOT, "prisma", "seed.ts"), "utf8");
  const found = [...seed.matchAll(/bcrypt\.hash\(\s*"([^"]+)"/g)].map((m) => m[1]);
  const extra = [...seed.matchAll(/bcrypt\.hashSync\(\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set([...found, ...extra])];
}

async function resolvePassword(hash: string, candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    if (await bcrypt.compare(c, hash)) return c;
  }
  return null;
}

async function main() {
  const candidates = seedPasswordCandidates();
  if (candidates.length === 0) {
    console.error("No bcrypt.hash(\"…\") literals found in prisma/seed.ts — cannot resolve passwords.");
    process.exit(1);
  }
  console.log(`Password candidates from prisma/seed.ts: ${candidates.length}`);

  const unresolved: string[] = [];
  const groups: unknown[] = [];

  // ── Platform tenant first: it is the bootstrap login, not a customer. ──
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true, name: true, email: true, role: true, passwordHash: true,
      isActive: true, customerCode: true,
      // Tier lives on Plan, not Subscription — Plan carries the frozen caps.
      plan: { select: { tier: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const platform = tenants.filter((t) => t.role === "super_admin");
  const customers = tenants.filter((t) => t.role !== "super_admin");

  if (platform.length) {
    const rows = [];
    for (const t of platform) {
      const pw = await resolvePassword(t.passwordHash, candidates);
      if (!pw) { unresolved.push(t.email); continue; }
      rows.push({
        role: t.role,
        who: t.name,
        email: t.email,
        password: pw,
        colour: ROLE_COLOUR[t.role] ?? FALLBACK_COLOUR,
      });
    }
    if (rows.length) {
      groups.push({
        org: "Platform (bootstrap)",
        note: "Walled into /admin. Cannot author any GxP record.",
        rows,
      });
    }
  }

  for (const t of customers) {
    if (!t.isActive) continue;
    const rows = [];

    const adminPw = await resolvePassword(t.passwordHash, candidates);
    if (adminPw) {
      rows.push({
        role: t.role,
        who: "Tenant admin",
        email: t.email,
        password: adminPw,
        colour: ROLE_COLOUR[t.role] ?? FALLBACK_COLOUR,
      });
    } else {
      unresolved.push(t.email);
    }

    const users = await prisma.user.findMany({
      where: { tenantId: t.id, isActive: true },
      select: {
        name: true, email: true, role: true, passwordHash: true,
        gxpSignatory: true, site: { select: { code: true } },
      },
      // Group same-role seats together; QA Head before the rest so the primary
      // login sits near the top of each tenant.
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    // A tenant with two seats of the same role needs them told apart — that is
    // the whole reason for having two (segregation of duties blocks one person
    // signing both sides of a review). Mark the later ones as alternate signers.
    const seenRole = new Map<string, number>();

    for (const u of users) {
      const pw = await resolvePassword(u.passwordHash, candidates);
      if (!pw) { unresolved.push(u.email); continue; }
      const n = (seenRole.get(u.role) ?? 0) + 1;
      seenRole.set(u.role, n);
      const bits = [u.name];
      if (u.site?.code) bits.push(u.site.code);
      if (n > 1 && u.gxpSignatory) bits.push("2nd signer");
      rows.push({
        role: u.role,
        who: bits.join(" · "),
        email: u.email,
        password: pw,
        colour: ROLE_COLOUR[u.role] ?? FALLBACK_COLOUR,
      });
    }

    if (!rows.length) continue;
    const tier = t.plan?.tier ?? "";
    groups.push({
      org: tier ? `${t.name} · ${tier.charAt(0)}${tier.slice(1).toLowerCase()}` : t.name,
      note: TIER_NOTE[tier] ?? undefined,
      rows,
    });
  }

  const out = {
    _comment:
      "GENERATED — do not hand-edit. Run `npx tsx scripts/gen-dev-credentials.ts` to rebuild from the database. " +
      "LOCAL ONLY: this file is gitignored; the passwords never enter version control. Read at request time by " +
      "app/login/page.tsx in development builds only. `role` is the STORED role slug — the login panel renders it " +
      "through the app's own roleLabel(), so the panel can never disagree with the rest of the UI.",
    _generatedAt: new Date().toISOString(),
    groups,
  };

  const dest = path.join(ROOT, "dev-credentials.local.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");

  const total = groups.reduce((n, g) => n + (g as { rows: unknown[] }).rows.length, 0);
  console.log(`Wrote ${total} accounts across ${groups.length} groups → dev-credentials.local.json`);
  if (unresolved.length) {
    console.warn(
      `\n${unresolved.length} account(s) omitted — password is not one of the seed's own literals:\n  ` +
        unresolved.join("\n  ") +
        "\nThese were probably changed by hand. Add them to dev-credentials.local.json yourself if you need them.",
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
