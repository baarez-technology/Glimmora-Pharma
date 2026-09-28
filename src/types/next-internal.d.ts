/**
 * Next.js ships its vendored dependencies without type declarations.
 *
 * `next/dist/compiled/path-to-regexp` is reached by
 * `src/lib/proxyMatcher.test.ts` to assert that the matcher literal in
 * `proxy.ts` compiles — under Next's own path-to-regexp — to the same decisions
 * the tested module makes. Next reads that literal at build time and this is the
 * only compiler that will ever see it, so testing our regex alone would leave the
 * framework's interpretation of it unverified.
 *
 * This is a declaration only. If a future Next version moves or renames the
 * module, the import fails and the test reports it, which is the correct outcome:
 * the check has to be re-pointed at the new path, not quietly dropped.
 */
declare module "next/dist/compiled/path-to-regexp" {
  /**
   * Compiles a Next.js `config.matcher` string to a RegExp. In this build it
   * returns the RegExp directly; the cast at the call site narrows it.
   */
  export function pathToRegexp(
    path: string,
    options?: { end?: boolean; sensitive?: boolean; delimiter?: string },
  ): RegExp;
}
