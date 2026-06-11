"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
// CHANGE CONTROL HIDDEN — pre-flight CC dependency gate bypassed. The
// loadCAPACCDeps action, cc-dependencies helpers, and CCOverrideModal
// are all still on disk; only the wire-up here is disconnected. To
// re-enable: restore the three imports below and the handleSignClick /
// CCOverrideModal blocks further down.
// import { loadCAPACCDeps } from "@/actions/capas";
// import {
//   isHardGateRisk,
//   type CCDependencyState,
// } from "@/lib/cc-dependencies";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { AlignmentReviewSection } from "./sections/AlignmentReviewSection";
import { ApprovalsSection } from "./sections/ApprovalsSection";
import { VerificationSection } from "./sections/VerificationSection";
import { ActionItemsSection } from "./sections/ActionItemsSection";
import { EffectivenessSection } from "./sections/EffectivenessSection";
import { DiscussionSection } from "./sections/DiscussionSection";
// import { CCOverrideModal } from "./modals/CCOverrideModal";

/* ── ActionsPanel shell ──
 *
 * The Actions tab in the CAPA detail modal. Renders five distinct
 * sections, each in its own file under sections/ + modals/:
 *
 *   1. AlignmentReviewSection (substage 4.7)
 *   2. DiscussionSection      (substage 5.2 §5.3)
 *   3. ApprovalsSection       (substage 5.2 — uses SignApprovalModal)
 *   4. SignAndClose flow      (substage 6.4 — uses CCOverrideModal)
 *
 * The shell owns one piece of cross-section state: `discussionVersion`,
 * which bumps on every Discussion mutation so ApprovalsSection's
 * close-gate re-evaluates against fresh comment data. All other state
 * lives inside the section/modal that owns it.
 */

interface ActionsPanelProps {
  capa: CAPA;
  isDark: boolean;
  actionLines: string[];
  users: UserConfig[];
  dateFormat: string;
  canSign: boolean;
  canCloseCapa: boolean;
  isOwner: boolean;
  onSubmitForReview: () => void;
  /**
   * Substage 6.4 — accept an optional CC-block override that the panel
   * collected via its pre-flight gate. The parent threads it into the
   * server-action call. When undefined, the SignClose flow runs as before.
   */
  onSignOpen: (override?: { reason: string }) => void;
  /** Called after a successful alignment-mutation server action so the
   *  parent modal can router.refresh() the underlying CAPA row. */
  onAlignmentChange?: () => void;
  /** Phase 6 — on the detail PAGE the morphing banner is the single home of
   *  Submit + Sign&Close, so suppress this panel's duplicate copies. */
  hideLifecycleButtons?: boolean;
  /** Phase 6 — person filter for the action-items table. */
  ownerFilter?: string | null;
}

export function ActionsPanel({
  capa,
  // isDark prop dropped from local destructure — last consumer (the
  // orange "RCA required to submit" warning panel) was removed when
  // submission-blocking signals consolidated into the Overview-tab
  // SubmissionChecklist. Prop kept on the interface so callers don't
  // need to change.
  isDark: _isDark,
  // SME Section 1, Stage 4 (FULL) — actionLines is the legacy
  // newline-split-string prop. Retained on the interface for callers
  // that haven't been migrated, but unused in the body now that
  // ActionItemsSection renders the structured table directly from capa.
  actionLines: _actionLines,
  users,
  dateFormat,
  canSign,
  canCloseCapa,
  isOwner,
  onSubmitForReview,
  onSignOpen,
  onAlignmentChange,
  hideLifecycleButtons = false,
  ownerFilter = null,
}: ActionsPanelProps) {
  // Bumps whenever the discussion thread mutates so ApprovalsSection can
  // re-evaluate the close-gate against fresh comment state.
  const [discussionVersion, setDiscussionVersion] = useState(0);
  const canSubmit =
    (capa.status === "open" || capa.status === "in_progress") &&
    (isOwner || canCloseCapa);
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;

  // CHANGE CONTROL HIDDEN — pre-flight CC dependency gate bypassed. The
  // signGateBusy / signGateError / ccOverrideOpen state and handleSignClick
  // function are commented out below; the Sign & Close button now calls
  // onSignOpen() directly. To re-enable: restore the imports above plus
  // this block and the <CCOverrideModal/> render further down.
  // const [signGateBusy, setSignGateBusy] = useState(false);
  // const [signGateError, setSignGateError] = useState<string | null>(null);
  // const [ccOverrideOpen, setCCOverrideOpen] = useState<{
  //   deps: CCDependencyState;
  // } | null>(null);
  //
  // const handleSignClick = async () => {
  //   setSignGateBusy(true);
  //   setSignGateError(null);
  //   const result = await loadCAPACCDeps(capa.id);
  //   setSignGateBusy(false);
  //   if (!result.success) {
  //     setSignGateError(result.error);
  //     return;
  //   }
  //   const { deps } = result.data as {
  //     capaRisk: string;
  //     deps: CCDependencyState;
  //   };
  //   if (deps.blockedCount > 0) {
  //     const refs = deps.blockedCCs
  //       .map((c) => c.reference ?? c.id.slice(0, 8))
  //       .join(", ");
  //     setSignGateError(
  //       `Cannot sign & close — ${deps.blockedCount} linked change control${deps.blockedCount === 1 ? "" : "s"} rejected: ${refs}. Remove the link or initiate a replacement Change Control.`,
  //     );
  //     return;
  //   }
  //   if (deps.incompleteCount > 0 && isHardGateRisk(capa.risk)) {
  //     const refs = deps.incompleteCCs
  //       .map((c) => c.reference ?? c.id.slice(0, 8))
  //       .join(", ");
  //     setSignGateError(
  //       `Cannot sign & close — ${deps.incompleteCount} linked change control${deps.incompleteCount === 1 ? "" : "s"} not yet implemented: ${refs}. ${capa.risk} risk CAPAs require all linked Change Controls to reach Implemented or Closed first.`,
  //     );
  //     return;
  //   }
  //   if (deps.incompleteCount > 0) {
  //     setCCOverrideOpen({ deps });
  //     return;
  //   }
  //   onSignOpen();
  // };

  return (
    <div
      role="tabpanel"
      id="subpanel-actions"
      aria-labelledby="subtab-actions"
      tabIndex={0}
      className="space-y-4"
    >
      {/* SME Section 1, Stage 4 (FULL) — structured Action Plan table.
          Replaces the legacy newline-split bullet list. correctiveActions
          remains on the CAPA row as a denormalised cache (rebuilt by
          syncCorrectiveActions on every action-item write); the
          actionLines prop is retained on this component's interface but
          intentionally unused below. */}
      <ActionItemsSection capa={capa} ownerFilter={ownerFilter} />

      {capa.effectivenessCheck &&
        capa.status === "closed" &&
        capa.effectivenessDate && (
          <div
            className="flex items-center gap-2 text-[12px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <TrendingUp
              className="w-4 h-4 text-[#6366f1]"
              aria-hidden="true"
            />
            <span>
              Effectiveness check:{" "}
              {dayjs.utc(capa.effectivenessDate).format(dateFormat)}
            </span>
          </div>
        )}

      {/* ── Substage 4.7 — Alignment Review ── */}
      <AlignmentReviewSection
        capa={capa}
        onAlignmentChange={onAlignmentChange}
      />

      {/* ── Substage 5.2 §5.3 — Discussion thread ──
            discussionVersion bumps on every successful comment mutation so
            ApprovalsSection's evaluateApprovalProgress() runs against fresh
            comment data and the close-button-blocking signal stays in sync. */}
      <DiscussionSection
        capa={capa}
        onCommentsChange={() => setDiscussionVersion((v) => v + 1)}
      />

      {/* ── Substage 5.2 — Tiered Approval Routing ── */}
      <ApprovalsSection capa={capa} discussionVersion={discussionVersion} />

      {/* ── SME Section 1, Stage 5 (FULL) — Independent QA Verification ── */}
      <VerificationSection capa={capa} />

      {/* ── SME Section 1, Stage 6 (FULL) — 90-day Effectiveness Review ── */}
      <EffectivenessSection capa={capa} />

      {!hideLifecycleButtons && canSubmit && hasRca && (
        <Button
          variant="secondary"
          icon={Send}
          fullWidth
          onClick={onSubmitForReview}
        >
          Submit for QA review
        </Button>
      )}
      {/* The "RCA required to submit" inline warning that used to render
          when canSubmit && !hasRca was removed — the SubmissionChecklist
          on the Overview tab + the persistent next-step banner above the
          tab strip already carry that signal. The button simply doesn't
          appear until the prerequisites are met. */}

      {!hideLifecycleButtons && canSign && canCloseCapa && capa.status === "pending_qa_review" && (
        <Button
          variant="primary"
          icon={ShieldCheck}
          fullWidth
          onClick={() => onSignOpen()}
        >
          Sign &amp; Close CAPA
        </Button>
      )}

      {/* CHANGE CONTROL HIDDEN — CCOverrideModal render suppressed. Modal
       *  file remains on disk; only the wire-up here is gone. To re-enable:
       *  restore the import + the state hooks above and uncomment this.
       *  {ccOverrideOpen && (
       *    <CCOverrideModal
       *      deps={ccOverrideOpen.deps}
       *      capa={capa}
       *      onCancel={() => setCCOverrideOpen(null)}
       *      onConfirm={(reason) => {
       *        setCCOverrideOpen(null);
       *        onSignOpen({ reason });
       *      }}
       *    />
       *  )}
       */}

      {capa.status === "closed" && capa.closedBy && (
        <div
          className="flex items-center gap-2 text-[11px] mt-2"
          style={{ color: "var(--text-muted)" }}
        >
          <CheckCircle2
            className="w-3.5 h-3.5 text-[#10b981]"
            aria-hidden="true"
          />
          <span>
            Closed by{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {users.find((u) => u.id === capa.closedBy)?.name ?? capa.closedBy}
            </span>
            {capa.closedAt && (
              <> on {dayjs.utc(capa.closedAt).format(dateFormat)}</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
