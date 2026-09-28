import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/**
 * Strip `//` comments and block comments before asserting on source text.
 *
 * Both the schema and the handler carry comments that NAME `bcrypt.hash` and
 * the 72-byte limit in order to explain them, and a naive text search matches
 * the explanation instead of the code. Every assertion below would pass for the
 * wrong reason.
 */
const code = (p: string): string =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

/**
 * bcryptjs truncates at 72 bytes, silently. A password longer than that is
 * accepted, hashed in full, and then permanently shortened — so the customer
 * cannot log in with what they typed, and support has no error to work from.
 *
 * Asserted against the source because the failure is a truncation, not a
 * rejection: nothing throws, and only the schema can prevent it.
 */
describe("signup initiate password bounds", () => {
  const ROUTE = "app/api/signup/initiate/route.ts";

  it("the zod schema caps the password at bcrypt's limit", () => {
    const src = code(ROUTE);
    const fieldAt = src.indexOf("password: z");
    assert.ok(fieldAt > -1, "the schema no longer has a password field");
    const chain = src.slice(fieldAt, src.indexOf("});", fieldAt));
    assert.match(
      chain,
      /\.max\(72\b/,
      "the password schema has no 72-byte ceiling, so bcryptjs silently " +
        "truncates long passwords and the customer cannot log in with what " +
        "they typed",
    );
  });

  it("records that the character count is not a byte count", () => {
    // 72 CHARACTERS of a 3-byte character is 216 bytes, well past bcrypt's
    // limit, so `.max(72)` is necessary but not sufficient on its own. The gap is
    // recorded in the comment above the schema rather than closed here: a
    // byte-length refinement belongs with the schema consolidation in Phase 4,
    // and pretending `.max(72)` solves it would be worse than saying so.
    const src = read(ROUTE);
    assert.match(
      src,
      /72 is a byte count|byte count/,
      "the character-vs-byte gap should be recorded at the schema, not left " +
        "implicit — a later reader will assume .max(72) is exact",
    );
  });

  it("the route is rate limited before it hashes", () => {
    const src = code(ROUTE);
    const limitAt = src.indexOf("consume(");
    const hashAt = src.indexOf("bcrypt.hash(");
    assert.ok(limitAt > -1, "the signup route has no rate limit at all");
    assert.ok(hashAt > -1, "the signup route no longer hashes, which would be surprising");
    assert.ok(
      limitAt < hashAt,
      "the rate limit must come before bcrypt.hash — otherwise the hash is the " +
        "thing being protected and it has already been paid for",
    );
  });
});
