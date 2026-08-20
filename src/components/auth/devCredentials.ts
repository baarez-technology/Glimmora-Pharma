/**
 * Shape of the login page's "Developer Credentials" panel data.
 *
 * The DATA itself is deliberately not here. It lives in the gitignored
 * `dev-credentials.local.json` at the repo root and is read at request time by
 * app/login/page.tsx — see the note there. This module carries only the type, so
 * both the server page and the client component agree on the shape without
 * either of them holding a password.
 *
 * Before this split, the credential table was a `CRED_ROWS` literal inside
 * LoginPage.tsx, which meant every seeded password was committed to the
 * repository. Moving it out is why the type is here alone.
 *
 * Pure type module — no runtime dependencies, safe to import from a server
 * component and a "use client" component alike.
 */

export interface DevCredRow {
  /** Role label shown on the chip, e.g. "QA Head". */
  role: string;
  /** Who this account is — person and site, e.g. "Dr. Priya Sharma · CHN". */
  who?: string;
  /** Identifier to autofill. Email or bare username both authenticate. */
  email: string;
  password: string;
  /** Chip colour, a hex string. Used at 10% alpha for the chip background. */
  colour: string;
}

export interface DevCredGroup {
  /** Tenant / organisation heading, e.g. "Helios Biologics · Enterprise". */
  org: string;
  /** Optional one-line hint about what this tenant is useful for. */
  note?: string;
  rows: DevCredRow[];
}
