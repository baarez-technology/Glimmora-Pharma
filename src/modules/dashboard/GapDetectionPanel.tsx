"use client";

import { ShieldAlert } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { MOCK_AI_RESPONSES } from "@/lib/ai";

/**
 * Compliance Gap Detection panel — roadmap AI feature 03, shipped as a MOCK
 * (rules-based, no real LLM — same MOCK_AI_RESPONSES convention as FDA 483 /
 * Deviation). It does NOT run a background job and does NOT create anything:
 * it surfaces the SAME live gap data the dashboard's AGI Insights panel reads
 * (overdue CAPAs, open critical findings, high-risk unvalidated systems,
 * overdue validations, open DI-gate CAPAs, periodic-review-overdue systems,
 * pending-QA CAPAs), re-presented as a severity-RANKED "nightly scan" view.
 *
 * Honesty: the counts come from `counts` (computed live in DashboardPage from
 * the same filtered slices that feed AGI Insights — single source, so the two
 * panels can't contradict each other). The "nightly scan" timestamp is a mock
 * framing for the roadmap mockup; the data reflects the current moment.
 */

type GapSeverity = "HIGH" | "MED" | "LOW";

interface Gap {
  id: string;
  severity: GapSeverity;
  label: string;
  detail: string;
  link: string;
}

export interface GapCounts {
  criticalCount: number;
  overdueCAPAs: number;
  csvHighRisk: number;
  overdueVal: number;
  diOpen: number;
  reviewOverdue: number;
  pending: number;
}

interface GapDetectionPanelProps {
  counts: GapCounts;
  router: { push: (href: string) => void };
}

const SEVERITY_RANK: Record<GapSeverity, number> = { HIGH: 0, MED: 1, LOW: 2 };

function severityVariant(s: GapSeverity) {
  return s === "HIGH" ? "red" : s === "MED" ? "amber" : "green";
}

// Rules-based severity mapping (honest, deterministic — matches the rung spec):
//   HIGH: overdue CAPAs, open critical findings, high-risk unvalidated systems,
//         overdue validations.
//   MED:  open DI-gate CAPAs, periodic review overdue.
//   LOW:  pending QA review.
function buildGaps(c: GapCounts): Gap[] {
  const plural = (n: number) => (n === 1 ? "" : "s");
  const gaps: Gap[] = [];
  if (c.overdueCAPAs > 0) gaps.push({ id: "overdue-capas", severity: "HIGH", label: `${c.overdueCAPAs} overdue CAPA${plural(c.overdueCAPAs)}`, detail: "Past due — inspection-finding risk.", link: "/capa" });
  if (c.criticalCount > 0) gaps.push({ id: "critical-findings", severity: "HIGH", label: `${c.criticalCount} open critical finding${plural(c.criticalCount)}`, detail: "Immediate attention required.", link: "/gap-assessment" });
  if (c.csvHighRisk > 0) gaps.push({ id: "csv-high-risk", severity: "HIGH", label: `${c.csvHighRisk} high-risk system${plural(c.csvHighRisk)} unvalidated`, detail: "FDA inspection exposure.", link: "/csv-csa" });
  if (c.overdueVal > 0) gaps.push({ id: "validation-overdue", severity: "HIGH", label: `${c.overdueVal} system${plural(c.overdueVal)} with overdue validation`, detail: "Validation lifecycle overdue.", link: "/csv-csa" });
  if (c.diOpen > 0) gaps.push({ id: "di-gate", severity: "MED", label: `${c.diOpen} open DI-gate CAPA${plural(c.diOpen)}`, detail: "Data integrity unresolved.", link: "/capa" });
  if (c.reviewOverdue > 0) gaps.push({ id: "review-overdue", severity: "MED", label: `${c.reviewOverdue} system${plural(c.reviewOverdue)} with periodic review overdue`, detail: "Periodic review past due.", link: "/csv-csa" });
  if (c.pending > 0) gaps.push({ id: "pending-qa", severity: "LOW", label: `${c.pending} CAPA${plural(c.pending)} awaiting QA sign-off`, detail: "Pending QA review.", link: "/capa" });
  return gaps.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function GapDetectionPanel({ counts, router }: GapDetectionPanelProps) {
  const gaps = buildGaps(counts);
  const scanLabel = `Last scan ${dayjs().format("DD MMM YYYY")} · 02:00`;

  return (
    <aside aria-label="Compliance gap detection" className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
          <span className="card-title">Gap Detection</span>
          {MOCK_AI_RESPONSES && <Badge variant="gray">mock</Badge>}
        </div>
        {gaps.length > 0 ? (
          <Badge variant="amber">{gaps.length} gap{gaps.length === 1 ? "" : "s"} detected</Badge>
        ) : (
          <Badge variant="green">clean</Badge>
        )}
      </div>
      <div className="card-body space-y-2">
        {/* Honest framing: mock nightly-scan identity; data is computed live. */}
        <p
          className="text-[10px]"
          style={{ color: "var(--text-muted)" }}
          title="Mock nightly scan (roadmap preview). Computed live from current data — no background job runs and nothing is created."
        >
          {scanLabel} &middot; nightly scan (preview)
        </p>

        {gaps.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            No gaps detected — last scan clean.
          </p>
        ) : (
          gaps.map((g) => (
            <div
              key={g.id}
              className="flex items-start gap-2 p-2.5 rounded-lg bg-(--bg-surface) border border-(--bg-border)"
            >
              <Badge variant={severityVariant(g.severity)}>{g.severity}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{g.label}</p>
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{g.detail}</p>
                <button
                  onClick={() => router.push(g.link)}
                  className="text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer mt-1"
                >
                  View &rarr;
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
