"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import type { ChangeControlStatus } from "@/lib/change-control-constants";
import type { CCDetail } from "../_shared";
import { Card } from "../components/Card";
import { CAPADependencyBanner } from "../components/CAPADependencyBanner";

/**
 * Change Control detail — Overview tab. Shows the descriptive cards,
 * status-transition buttons, and the soft-delete affordance. The
 * reciprocal CAPA-dependency banner sits at the top so a CC owner
 * sees the downstream load this CC carries.
 */
export function OverviewTab({
  cc,
  isDeleted,
  transitions,
  isApproverRole,
  canDelete,
  onTransition,
  onDelete,
}: {
  cc: CCDetail;
  isDeleted: boolean;
  transitions: { label: string; target: ChangeControlStatus; variant: "primary" | "secondary" | "danger" | "ghost"; needsApprover: boolean }[];
  isApproverRole: boolean;
  canDelete: boolean;
  onTransition: (target: ChangeControlStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Substage 6.4 — reciprocal CAPA dependency banner. Surfaces the
       *  load this CC carries: how many CAPAs are blocked from sealing
       *  while it stays unfinished, and whether any of those are
       *  hard-gated (Critical/High). This is the mirror of the dep banner
       *  on the CAPA side, designed so a CC owner sees the downstream
       *  cost of slipping the schedule. */}
      <CAPADependencyBanner cc={cc} />

      <Card label="Description">{cc.description}</Card>
      <Card label="Rationale">{cc.rationale}</Card>
      {cc.impactAssessment && (
        <Card label="Impact assessment">{cc.impactAssessment}</Card>
      )}
      {cc.affectedSystems && (
        <Card label="Affected systems">{cc.affectedSystems}</Card>
      )}

      <div
        className="rounded-md p-2.5"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Timeline
        </p>
        <p
          className="text-[12px]"
          style={{ color: "var(--text-primary)" }}
        >
          Target:{" "}
          {cc.targetImplementationDate
            ? dayjs.utc(cc.targetImplementationDate).format("DD MMM YYYY")
            : "—"}
          {" · "}
          Actual:{" "}
          {cc.actualImplementationDate
            ? dayjs.utc(cc.actualImplementationDate).format("DD MMM YYYY")
            : "—"}
        </p>
      </div>

      {/* Status transition buttons */}
      {!isDeleted && transitions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2">
          {transitions.map((t) => {
            const disabled = t.needsApprover && !isApproverRole;
            return (
              <Button
                key={t.target}
                variant={t.variant}
                size="sm"
                icon={
                  t.target === "Approved" || t.target === "Closed"
                    ? ShieldCheck
                    : t.target === "Rejected"
                      ? AlertTriangle
                      : t.target === "Implemented"
                        ? CheckCircle2
                        : Send
                }
                disabled={disabled}
                onClick={() => onTransition(t.target)}
                title={
                  disabled
                    ? "Requires QA Head, Customer Admin, or Super Admin"
                    : undefined
                }
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      )}

      {!isDeleted && canDelete && (
        <div
          className="pt-3"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={onDelete}
          >
            Delete change control
          </Button>
          <p
            className="text-[10px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Soft delete — owner or Super Admin only. Cannot delete while CAPA
            links exist.
          </p>
        </div>
      )}

      {isDeleted && (
        <div
          className="alert alert-danger flex items-start gap-2 mt-3"
          role="status"
        >
          <Trash2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            Deleted by {cc.deletedByName ?? "(unknown)"} —{" "}
            {cc.deletionReason ?? "no reason recorded"}
          </p>
        </div>
      )}
    </div>
  );
}
