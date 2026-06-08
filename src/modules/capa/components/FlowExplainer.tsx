"use client";

import { useState } from "react";
import { X, Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Phase B — G3. One source of truth for the "How a CAPA flows" copy, surfaced
 * two ways: a dismissible inline panel under the tracker's Status guide, and a
 * modal opened from the "?" beside the detail-page banner readiness text.
 */
export const FLOW_STEPS: string[] = [
  "Create the CAPA (title, description, source, risk)",
  "Assign action items + a driver",
  "Fixers do their tasks from their Worklist",
  "Driver submits for QA review (when ready)",
  "QA reviews → approves",
  "Independent QA verifies",
  "Sign & close (or reject → rework)",
  "Closed",
  "90-day effectiveness check",
];

function FlowSteps() {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 list-none p-0 m-0">
      {FLOW_STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="text-[11px] px-2 py-1 rounded-md" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{s}</span>
          {i < FLOW_STEPS.length - 1 && <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>→</span>}
        </li>
      ))}
    </ol>
  );
}

/** Modal variant — opened from the detail-page banner "?". */
export function FlowExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How a CAPA flows">
      <FlowSteps />
    </Modal>
  );
}

/** Inline dismissible variant — sits under the tracker's Status guide. */
export function FlowExplainerInline() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="rounded-lg border p-3 mb-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <Info className="w-3.5 h-3.5" aria-hidden="true" /> How a CAPA flows
        </p>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="bg-transparent border-none cursor-pointer p-0.5" style={{ color: "var(--text-muted)" }}>
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
      <FlowSteps />
    </div>
  );
}
