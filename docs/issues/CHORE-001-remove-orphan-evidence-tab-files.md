# CHORE-001 — Delete orphan DILStatusTab.tsx and PackBuilderTab.tsx

**Severity:** Low
**Status:** Open
**Filed:** 2026-05-03
**Source:** Surfaced during the USER_GUIDE.md verification pass —
see [USER_GUIDE_CONFIRMATIONS.md](../USER_GUIDE_CONFIRMATIONS.md)
item 5.

## Description

Two component files exist on disk but are not imported or
rendered anywhere:

- [src/modules/evidence/tabs/DILStatusTab.tsx](../../src/modules/evidence/tabs/DILStatusTab.tsx)
- [src/modules/evidence/tabs/PackBuilderTab.tsx](../../src/modules/evidence/tabs/PackBuilderTab.tsx)

[src/modules/evidence/EvidencePage.tsx:32](../../src/modules/evidence/EvidencePage.tsx#L32) imports `DocumentLibraryTab`
**only**. The pack-builder logic that PackBuilderTab.tsx
exports was reimplemented inline in EvidencePage.tsx (the
`exportPack` function at [EvidencePage.tsx:388-436](../../src/modules/evidence/EvidencePage.tsx#L388-L436), triggered
by the inline "Export Pack" button at L684). DILStatusTab has
no inline replacement — the DIL status concept appears to have
been folded into the unified document library view.

## Why this matters

In a regulated codebase, dead code is an audit smell — an
auditor reading the source can't tell whether unreferenced
components are "in development", "deprecated but kept for
reference", or simply forgotten. They will ask. Removing the
files removes the question.

## Action

1. Confirm one more time (right before deletion) that nothing
   imports these files:
   ```
   grep -rn "DILStatusTab\|PackBuilderTab" src/ app/ pages/
   ```
   Expected: zero hits outside the files themselves.
2. Delete both files.
3. Run `npx tsc --noEmit` and `npm run lint` to confirm no
   transitive consumers (orphan types, etc.) break.
4. Run `npm run test:smoke` for sanity.
5. Commit as `chore: remove orphan evidence tab components`.

## Affected users

None — these files render no UI today.

## Blocks

Nothing. Pure code-hygiene cleanup. Can ship in any branch
that touches the evidence module, or as a standalone chore.

## Related

- USER_GUIDE_CONFIRMATIONS.md item 5
- Live import in [src/modules/evidence/EvidencePage.tsx:32](../../src/modules/evidence/EvidencePage.tsx#L32)
- The inline reimplementation in EvidencePage (the `exportPack`
  function at L388 + the export button at L684) — this is what
  the orphan files were supposed to do.
