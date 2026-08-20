import { readFile } from "node:fs/promises";
import path from "node:path";
import { LoginPage } from "@/components/auth/LoginPage";
import type { DevCredGroup } from "@/components/auth/devCredentials";

// Route-segment config. Forces this page to be rendered at request-time
// instead of statically prerendered at build. Prerendering produced a
// stale RSC variant that the DO CDN cached and served as Content-Type:
// text/x-component for direct browser GETs, surfacing the raw flight
// payload to users (see incident 2026-05-16).
export const dynamic = "force-dynamic";

/**
 * Seeded dev logins for the login page's "Developer Credentials" panel.
 *
 * Read from `dev-credentials.local.json` at the repo root, which is GITIGNORED —
 * the passwords exist on a developer's machine and nowhere in version control.
 * `dev-credentials.example.json` is the tracked template.
 *
 * Read at request time with fs rather than imported as a module, deliberately:
 * a static import of a gitignored file would fail the build for anyone who does
 * not have it. A missing file here is a normal outcome — the panel renders its
 * empty state and points the reader at the template.
 *
 * Guarded on NODE_ENV twice over: this function short-circuits in any
 * non-development build, and LoginPage's panel is itself gated the same way, so
 * no seed password can reach a production or staging bundle even if this file
 * were somehow present on the server.
 */
async function loadDevCredentials(): Promise<DevCredGroup[]> {
  if (process.env.NODE_ENV !== "development") return [];
  try {
    const raw = await readFile(
      path.join(process.cwd(), "dev-credentials.local.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { groups?: DevCredGroup[] };
    return Array.isArray(parsed.groups) ? parsed.groups : [];
  } catch {
    // Absent, unreadable or malformed — all the same to the caller. Never let a
    // convenience panel take the login page down.
    return [];
  }
}

export default async function Page() {
  return <LoginPage devCredentials={await loadDevCredentials()} />;
}
