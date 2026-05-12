"use client";

import { CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DetailSubTab } from "../helpers/getNextStep";

/**
 * Single source of truth for "what's blocking submission." Replaces the
 * three previously-independent inline warnings on the RCA, Actions, and
 * Effectiveness Criteria tabs — those said the same thing in different
 * places and made it unclear whether they were one signal or three.
 *
 * Five required items, in submission-order priority. Each unchecked
 * item is a button that switches to the relevant tab. Once all five
 * land, the panel collapses to a single success row.
 */
export function SubmissionChecklist({
  hasDescription,
  hasRca,
  hasActions,
  hasCriteria,
  hasAlignment,
  onChangeTab,
}: {
  hasDescription: boolean;
  hasRca: boolean;
  hasActions: boolean;
  hasCriteria: boolean;
  hasAlignment: boolean;
  onChangeTab: (tab: DetailSubTab) => void;
}) {
  const items: {
    label: string;
    done: boolean;
    tab: DetailSubTab;
  }[] = [
    { label: "Description (≥ 20 characters)", done: hasDescription, tab: "overview" },
    { label: "Root cause documented", done: hasRca, tab: "rca" },
    { label: "At least 1 corrective action", done: hasActions, tab: "actions" },
    { label: "At least 1 effectiveness criterion", done: hasCriteria, tab: "criteria" },
    { label: "Alignment review verdict recorded", done: hasAlignment, tab: "actions" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (allDone) {
    return (
      <aside
        className="flex items-center gap-2.5 p-3 rounded-lg border"
        style={{
          background: "var(--success-bg)",
          borderColor: "var(--success)",
        }}
        aria-label="Ready to submit"
      >
        <CheckCircle2
          className="w-5 h-5 shrink-0"
          style={{ color: "var(--success)" }}
          aria-hidden="true"
        />
        <p className="text-[12px] font-semibold flex-1" style={{ color: "var(--success)" }}>
          Ready to submit — go to the Actions tab to submit for review.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChangeTab("actions")}
        >
          Go to Actions tab
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className="rounded-lg border p-3"
      style={{
        background: "var(--info-bg)",
        borderColor: "var(--brand-border)",
      }}
      aria-label="Submission checklist"
    >
      <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
        Before submitting for review
      </p>
      <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-secondary)" }}>
        Complete the items below, then submit from the Actions tab.
      </p>
      <ul role="list" className="space-y-1 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <span
                className="flex items-center gap-1.5 text-[12px] line-through"
                style={{ color: "var(--text-muted)" }}
              >
                <CheckCircle2
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--success)" }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onChangeTab(item.tab)}
                className="flex items-center gap-1.5 text-[12px] border-none bg-transparent cursor-pointer p-0 hover:underline"
                style={{ color: "var(--text-primary)" }}
              >
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm shrink-0"
                  style={{
                    border: "1.5px solid var(--text-muted)",
                  }}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p
        className="text-[11px] mt-2"
        style={{ color: "var(--text-muted)" }}
      >
        {doneCount} of {items.length} items complete
      </p>
    </aside>
  );
}
