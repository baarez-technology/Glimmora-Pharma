"use client";

/**
 * Deviation Intelligence — AGI panel embedded in Deviation Management.
 *
 * Surfaces recurring deviation patterns the agent clusters from the tenant's
 * own deviation history (by area). CAN DO (AI-assisted): cluster similar
 * deviations, surface recurring patterns, suggest potential root causes, flag
 * high-frequency areas. CANNOT DO (human only): close deviations, approve
 * investigations, make risk decisions — so this panel is read-only analysis;
 * every action (investigate / close) stays in the existing deviation flow.
 *
 * Data flows through the AI gateway getDeviationIntelligence() (mocked now;
 * flip MOCK_AI_RESPONSES + implement real clustering to connect a live model —
 * the return shape stays identical, so this UI needs no changes).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bot,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Layers,
} from "lucide-react";
import {
  getDeviationIntelligence,
  type DeviationClusterInput,
  type DeviationIntelligenceResult,
} from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface DeviationIntelligencePanelProps {
  /** The tenant's deviations, projected to the clustering input shape. */
  deviations: DeviationClusterInput[];
  /** Open a deviation's detail modal (member-ref click-through). */
  onOpenDeviation: (id: string) => void;
}

export function DeviationIntelligencePanel({
  deviations,
  onOpenDeviation,
}: DeviationIntelligencePanelProps) {
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.deviation);
  const agentActive = agiMode !== "manual" && agiAgent;

  const [result, setResult] = useState<DeviationIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Stable signature so the auto-analyse effect only re-fires when the
  // deviation set actually changes (the parent rebuilds the array each render).
  const signature = useMemo(
    () => deviations.map((d) => `${d.id}:${d.area}:${d.severity}`).join("|"),
    [deviations],
  );

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await getDeviationIntelligence(deviations));
    } finally {
      setLoading(false);
    }
  }, [deviations]);

  useEffect(() => {
    if (agentActive && deviations.length > 0) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentActive, signature]);

  // Agent off, or nothing to analyse yet — render nothing (keep the page clean).
  if (!agentActive || deviations.length === 0) return null;

  const clusters = result?.clusters ?? [];
  const patternCount = result?.patternCount ?? 0;

  return (
    <div className="card">
      <div className="card-header">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 flex-1 text-left"
          aria-expanded={!collapsed}
          aria-controls="deviation-intel-body"
        >
          <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
          <span className="card-title">Deviation Intelligence</span>
          {!loading && (
            <Badge variant={patternCount > 0 ? "amber" : "green"}>
              {patternCount > 0
                ? `${patternCount} pattern${patternCount > 1 ? "s" : ""}`
                : "no patterns"}
            </Badge>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
        </button>
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          onClick={analyze}
          disabled={loading}
          aria-label="Re-analyse deviation patterns"
        >
          {loading ? "Analysing…" : "Re-analyse"}
        </Button>
      </div>

      {!collapsed && (
        <div id="deviation-intel-body" className="card-body space-y-3">
          {/* Advisory — assistive, QA decides. */}
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            AI-clustered patterns across {result?.analyzedCount ?? deviations.length}{" "}
            deviations. Suggestions are advisory — the agent does not close
            deviations, approve investigations, or make risk decisions.
          </p>

          {loading && clusters.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-8 gap-3"
              role="status"
              aria-live="polite"
            >
              <div
                className="w-7 h-7 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin"
                aria-hidden="true"
              />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Analysing deviation history…
              </p>
            </div>
          ) : clusters.length === 0 ? (
            <div className="flex items-start gap-2 py-2">
              <Layers className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                No recurring patterns detected yet. Patterns surface once 2+
                deviations share an area.
              </p>
            </div>
          ) : (
            <ul className="list-none p-0 m-0 space-y-3">
              {clusters.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border p-3"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.isHighFrequency ? (
                        <AlertTriangle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
                      )}
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {c.theme}
                      </span>
                      <Badge variant="blue">{c.count} deviations</Badge>
                      {c.isHighFrequency && <Badge variant="red">High frequency</Badge>}
                    </div>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {c.confidence}% confidence
                    </span>
                  </div>

                  {/* Severity mix + categories */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {c.severityMix.critical > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                        {c.severityMix.critical} critical
                      </span>
                    )}
                    {c.severityMix.major > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                        {c.severityMix.major} major
                      </span>
                    )}
                    {c.severityMix.minor > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        {c.severityMix.minor} minor
                      </span>
                    )}
                    {c.categoryChips.map((cat) => (
                      <span key={cat.label} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                        {cat.label}{cat.count > 1 ? ` ×${cat.count}` : ""}
                      </span>
                    ))}
                  </div>

                  {/* Suggested root cause */}
                  <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                        Suggested root cause
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {c.suggestedRootCause}
                      </p>
                    </div>
                  </div>

                  {/* Member refs — click to open */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>In this cluster:</span>
                    {c.members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onOpenDeviation(m.id)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border-none cursor-pointer hover:underline"
                        style={{ background: "var(--brand-muted)", color: "var(--brand)" }}
                      >
                        {m.reference}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
