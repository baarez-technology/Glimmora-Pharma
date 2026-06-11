"use client";

/**
 * Batch Records — Batch Readiness Agent surface.
 *
 * AGI agent for the `batch` toggle (Settings → AGI Policy). CAN DO
 * (AI-assisted): analyse batch-record completeness, flag missing entries,
 * highlight review items, suggest a pre-release checklist. CANNOT DO (human
 * only): release/approve batches, make disposition decisions, override QP
 * authority — so this page is advisory analysis; no release action exists.
 *
 * Batch records come from `listBatchRecords()` (a deterministic demo source;
 * real backend = MES). The completeness analysis flows through the AI gateway
 * getBatchReadiness() (mocked now). Flip MOCK_AI_RESPONSES + implement the
 * real model to connect a live agent — the return shape stays identical.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Bot,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import {
  listBatchRecords,
  analyzeBatchReadiness,
  getBatchReadiness,
  type BatchRecord,
  type BatchReadinessResult,
} from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  READINESS_BADGE,
  READINESS_LABEL,
  ENTRY_STATUS_COLOR,
  LIFECYCLE_LABEL,
} from "./_shared";

export function BatchRecordsPage() {
  const router = useRouter();
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.batch);
  const agentActive = agiMode !== "manual" && agiAgent;

  const batches = useMemo(() => listBatchRecords(), []);
  const [selectedId, setSelectedId] = useState<string>(batches[0]?.id ?? "");
  const [result, setResult] = useState<BatchReadinessResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedBatch = batches.find((b) => b.id === selectedId) ?? null;

  const scan = useCallback(async (batch: BatchRecord) => {
    setLoading(true);
    try {
      setResult(await getBatchReadiness(batch));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (agentActive && selectedBatch) scan(selectedBatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentActive, selectedId]);

  /* ── Agent disabled state ── */
  if (!agentActive) {
    return (
      <section aria-label="Batch Records" className="w-full space-y-5">
        <PageHeader title="Batch Records" subtitle="Pre-release batch record readiness" />
        <div className="card">
          <div className="card-body flex flex-col items-center text-center py-10 gap-3">
            <Boxes className="w-10 h-10" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              Batch Readiness agent is off
            </p>
            <p className="text-[12px] max-w-sm" style={{ color: "var(--text-secondary)" }}>
              Enable the Batch Readiness agent (or switch AGI out of manual mode)
              to analyse batch-record completeness before release.
            </p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/settings")}>
              Configure in Settings → AGI Policy
            </Button>
          </div>
        </div>
      </section>
    );
  }

  /* ── KPI summary across all batches (sync) ── */
  const summaries = batches.map((b) => analyzeBatchReadiness(b));
  const readyCount = summaries.filter((s) => s.readiness === "ready").length;
  const notReadyCount = summaries.filter((s) => s.readiness === "not_ready").length;

  return (
    <section aria-label="Batch Records" className="w-full space-y-5">
      <PageHeader
        title="Batch Records"
        subtitle="Pre-release batch record readiness"
        actions={
          selectedBatch ? (
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => selectedBatch && scan(selectedBatch)}
              disabled={loading}
              aria-label="Re-analyse selected batch"
            >
              {loading ? "Analysing…" : "Re-analyse"}
            </Button>
          ) : undefined
        }
      />

      {/* Guardrail — advisory only, QP releases. */}
      <div
        className="flex items-start gap-2 p-3 rounded-lg border"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
        role="note"
      >
        <Bot className="w-4 h-4 mt-0.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          AI completeness analysis. The agent flags gaps and suggests a
          pre-release checklist — it does <strong>not</strong> release or approve
          batches or make disposition decisions. QP retains release authority.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Boxes} color="#0ea5e9" label="Batches" value={String(batches.length)} sub="In the pre-release queue" />
        <StatCard icon={CheckCircle2} color="#10b981" label="Ready" value={String(readyCount)} sub="Record complete" />
        <StatCard icon={ShieldAlert} color={notReadyCount > 0 ? "#ef4444" : "#10b981"} label="Not ready" value={String(notReadyCount)} sub={notReadyCount > 0 ? "Missing entries" : "None blocked"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-start">
        {/* Batch list */}
        <div className="card lg:col-span-1">
          <div className="card-header">
            <span className="card-title">Batches</span>
          </div>
          <ul className="list-none p-0 m-0 divide-y divide-(--bg-border)">
            {batches.map((b) => {
              const a = analyzeBatchReadiness(b);
              const isSel = b.id === selectedId;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    aria-pressed={isSel}
                    aria-label={`Batch ${b.id}`}
                    className="w-full text-left px-4 py-3 border-none cursor-pointer transition-colors"
                    style={{ background: isSel ? "var(--brand-muted)" : "transparent" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--brand)" }}>{b.id}</span>
                      <Badge variant={READINESS_BADGE[a.readiness]}>{READINESS_LABEL[a.readiness]}</Badge>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{b.product}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {b.stage} · {LIFECYCLE_LABEL[b.status]} · {a.completenessPct}% complete
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Readiness detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedBatch ? (
            <div className="card"><div className="card-body text-center py-10 text-[12px]" style={{ color: "var(--text-muted)" }}>Select a batch to analyse.</div></div>
          ) : loading ? (
            <div className="card">
              <div className="card-body flex flex-col items-center justify-center py-12 gap-3" role="status" aria-live="polite">
                <div className="w-8 h-8 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin" aria-hidden="true" />
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Analysing batch record…</p>
              </div>
            </div>
          ) : result ? (
            <>
              {/* Header card */}
              <div className="card">
                <div className="card-body space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-mono text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{selectedBatch.id}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {selectedBatch.product} · {selectedBatch.stage} · {selectedBatch.site}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Manufactured {dayjs(selectedBatch.manufactureDate).format("DD MMM YYYY")}
                        {result.scannedAt && ` · Analysed ${dayjs(result.scannedAt).format("HH:mm")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[26px] font-bold leading-none" style={{ color: result.readiness === "ready" ? "#10b981" : result.readiness === "needs_review" ? "#f59e0b" : "#ef4444" }}>
                        {result.completenessPct}%
                      </p>
                      <Badge variant={READINESS_BADGE[result.readiness]}>{READINESS_LABEL[result.readiness]}</Badge>
                    </div>
                  </div>
                  {/* Completeness bar */}
                  <div className="h-2 rounded-full bg-(--bg-border) overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${result.completenessPct}%`,
                        background: result.readiness === "ready" ? "#10b981" : result.readiness === "needs_review" ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {result.completeEntries} of {result.totalEntries} record entries complete.
                  </p>
                </div>
              </div>

              {/* Missing entries */}
              {result.missingEntries.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
                      <span className="card-title">Missing entries ({result.missingEntries.length})</span>
                    </div>
                  </div>
                  <ul className="list-none p-0 m-0 card-body space-y-1.5">
                    {result.missingEntries.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ENTRY_STATUS_COLOR.missing }} aria-hidden="true" />
                        <span style={{ color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--text-muted)" }}>{e.section}:</span> {e.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Review items */}
              {result.reviewItems.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
                      <span className="card-title">Highlighted for review ({result.reviewItems.length})</span>
                    </div>
                  </div>
                  <ul className="list-none p-0 m-0 card-body space-y-1.5">
                    {result.reviewItems.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ENTRY_STATUS_COLOR.review }} aria-hidden="true" />
                        <span style={{ color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--text-muted)" }}>{e.section}:</span> {e.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggested pre-release checklist */}
              <div className="card">
                <div className="card-header">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
                    <span className="card-title">Suggested pre-release checklist</span>
                  </div>
                </div>
                <ul className="list-none p-0 m-0 card-body space-y-2">
                  {result.checklist.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-[12px]">
                      {c.done ? (
                        <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" aria-hidden="true" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: "#ef4444" }} aria-hidden="true" />
                      )}
                      <span style={{ color: c.done ? "var(--text-primary)" : "var(--text-muted)" }}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="card-body pt-0">
                  <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                    Advisory checklist. Batch release and disposition remain a QP decision.
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
