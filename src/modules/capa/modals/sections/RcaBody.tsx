"use client";

import { Badge } from "@/components/ui/Badge";
import type { CAPA } from "@/store/capa.slice";

/**
 * RCA tab body. Read-only display of the root cause analysis text +
 * methodology badge. Editing happens via the detail modal's Edit button
 * (which opens EditCAPAModal). The empty-state previously carried an
 * orange "RCA not yet documented" warning; that was consolidated into
 * the SubmissionChecklist on the Overview tab as part of the UX wins.
 */
export function RcaBody({ capa }: { capa: CAPA }) {
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;
  return (
    <div role="tabpanel" id="subpanel-rca" aria-labelledby="subtab-rca" tabIndex={0} className="space-y-3">
      {capa.rcaMethod && (
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Method:</span>
          <Badge variant="purple">{capa.rcaMethod}</Badge>
        </div>
      )}
      {hasRca ? (
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{capa.rca}</p>
      ) : (
        // The orange "RCA not yet documented" warning that used to render
        // here was removed — the SubmissionChecklist on the Overview tab
        // and the persistent next-step banner above the tab strip both
        // already surface this signal. A single empty-state hint is enough.
        <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
          No root cause analysis documented yet. Use Edit to add one (5 Whys, Fishbone, Fault Tree).
        </p>
      )}
    </div>
  );
}
