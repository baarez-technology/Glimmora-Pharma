import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  Plus,
  AlertCircle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  addEvent,
  updateEvent,
  addObservation,
  updateObservation,
  addCommitment,
  setResponseDraft,
  setAGIDraft,
  type FDA483Event,
  type EventStatus,
  type Observation,
} from "@/store/fda483.slice";
import { addCAPA } from "@/store/capa.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup } from "@/components/shared";

import { EventsTab } from "./tabs/EventsTab";
import { ObservationsTab } from "./tabs/ObservationsTab";
import { ResponseTab } from "./tabs/ResponseTab";
import { RCATab } from "./tabs/RCATab";
import { AddEventModal, type EventFormData } from "./modals/AddEventModal";
import { AddObservationModal, type ObsFormData } from "./modals/AddObservationModal";
import { AddCommitmentModal, type CommitFormData } from "./modals/AddCommitmentModal";
import { SignSubmitModal } from "./modals/SignSubmitModal";

/* ── Helpers ── */

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
}

export function computeReadiness(e: FDA483Event): number {
  // New step order: Event (20) → Observations (40) → RCA (60) → Response draft (80) → Submitted (100)
  if (e.status === "Response Submitted" || e.status === "Closed") return 100;
  const hasObs = e.observations.length > 0;
  const allRca = hasObs && e.observations.every((o) => !!o.rootCause?.trim());
  const allCapa = hasObs && e.observations.every((o) => !!o.capaId);
  const hasDraft = !!e.responseDraft?.trim();
  let score = 20;                                // Step 1 — event exists
  if (hasObs) score = 40;                        // Step 2 — observations added
  if (hasObs && allRca && allCapa) score = 60;   // Step 3 — RCA + CAPA done
  if (hasObs && allRca && allCapa && hasDraft) score = 80; // Step 4 — response drafted
  return score;
}

type Step = 1 | 2 | 3 | 4;

/* ══════════════════════════════════════ */

export function FDA483Page() {
  const dispatch = useAppDispatch();
  const { fda483Events: events, capas, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.fda483);
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { role, canSign } = useRole();
  const { hasSites } = useSetupStatus();

  function ownerName(id: string) {
    return users.find((u) => u.id === id)?.name ?? id;
  }

  /* ── State ── */
  const [selectedEvent, setSelectedEvent] = useState<FDA483Event | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addObsOpen, setAddObsOpen] = useState(false);
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [addCommitOpen, setAddCommitOpen] = useState(false);
  const [eventAddedPopup, setEventAddedPopup] = useState(false);
  const [obsAddedPopup, setObsAddedPopup] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [signedPopup, setSignedPopup] = useState(false);
  const [responseSavedPopup, setResponseSavedPopup] = useState(false);
  const [rcaSavedPopup, setRcaSavedPopup] = useState(false);
  const [capaRaisedPopup, setCapaRaisedPopup] = useState(false);
  const [selectedObsId, setSelectedObsId] = useState("");
  const [whyAnswers, setWhyAnswers] = useState(["", "", "", "", ""]);
  const [fishboneAnswers, setFishboneAnswers] = useState<
    Record<string, string>
  >({});
  const [fishboneRoot, setFishboneRoot] = useState("");
  const [freeformRCA, setFreeformRCA] = useState("");
  const [noSitesOpen, setNoSitesOpen] = useState(false);

  /* ── Derived from Redux so selectedEvent stays fresh ── */
  const liveEvent = selectedEvent
    ? (events.find((e) => e.id === selectedEvent.id) ?? null)
    : null;
  const selectedObs =
    liveEvent?.observations.find((o) => o.id === selectedObsId) ?? null;

  useEffect(() => {
    if (liveEvent) {
      setResponseText(liveEvent.responseDraft ?? "");
      setEditingResponse(false);
      setSelectedObsId(liveEvent.observations[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (selectedObs?.rcaMethod === "5 Why" && selectedObs.rootCause) {
      const lines = selectedObs.rootCause.split("\n");
      setWhyAnswers(
        lines
          .map((l) => l.replace(/^Why \d: /, ""))
          .concat(Array(5).fill(""))
          .slice(0, 5),
      );
    } else {
      setWhyAnswers(["", "", "", "", ""]);
    }
    setFishboneAnswers({});
    setFishboneRoot("");
    setFreeformRCA("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObsId]);

  /* ── Computed ── */
  const openCount = events.filter((e) => getEffectiveStatus(e) === "Open").length;
  const dueCount = events.filter((e) => getEffectiveStatus(e) === "Response Due").length;
  const closedCount = events.filter((e) => getEffectiveStatus(e) === "Closed").length;
  const urgentEvents = events.filter((e) => getEffectiveStatus(e) === "Response Due" && daysLeft(e.responseDeadline) >= 0 && daysLeft(e.responseDeadline) <= 5);
  const anyFilter = !!(typeFilter || statusFilter || siteFilter);
  const filteredEvents = events.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (statusFilter && getEffectiveStatus(e) !== statusFilter) return false;
    if (siteFilter && e.siteId !== siteFilter) return false;
    return true;
  });

  /* ── Step workflow status (new order: Event → Observations → RCA → Response) ── */
  const hasEvent = !!liveEvent;
  const hasObservations = !!liveEvent && liveEvent.observations.length > 0;
  const hasRcaAndCapa = hasObservations
    && liveEvent.observations.every((o) => o.rootCause?.trim() && !!o.capaId);
  const hasSubmitted = !!liveEvent
    && (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed");
  const canSubmitResponse = hasRcaAndCapa;

  /* ── Handlers ── */

  function onEventSave(data: EventFormData) {
    const id = crypto.randomUUID();
    dispatch(
      addEvent({
        ...data,
        id,
        tenantId: tenantId ?? "",
        observations: [],
        commitments: [],
        responseDraft: "",
        agiDraft: "",
        inspectionDate: data.inspectionDate
          ? dayjs(data.inspectionDate).utc().toISOString()
          : "",
        responseDeadline: data.responseDeadline
          ? dayjs(data.responseDeadline).utc().toISOString()
          : "",
        createdAt: dayjs().toISOString(),
      }),
    );
    auditLog({
      action: "FDA483_EVENT_LOGGED",
      module: "fda-483",
      recordId: id,
      newValue: data,
    });
    setAddEventOpen(false);
    setEventAddedPopup(true);
  }

  function onObsSave(data: ObsFormData) {
    if (!liveEvent) return;
    if (editingObs) {
      dispatch(
        updateObservation({
          eventId: liveEvent.id,
          obsId: editingObs.id,
          patch: data,
        }),
      );
    } else {
      dispatch(
        addObservation({
          eventId: liveEvent.id,
          obs: {
            ...data,
            id: crypto.randomUUID(),
            area: data.area ?? "",
            regulation: data.regulation ?? "",
          },
        }),
      );
    }
    auditLog({
      action: editingObs ? "FDA483_OBS_UPDATED" : "FDA483_OBS_ADDED",
      module: "fda-483",
      recordId: liveEvent.id,
    });
    setAddObsOpen(false);
    setEditingObs(null);
    setObsAddedPopup(true);
  }

  function onCommitSave(data: CommitFormData) {
    if (!liveEvent) return;
    dispatch(
      addCommitment({
        eventId: liveEvent.id,
        commitment: {
          ...data,
          id: crypto.randomUUID(),
          eventId: liveEvent.id,
          dueDate: dayjs(data.dueDate).utc().toISOString(),
        },
      }),
    );
    auditLog({
      action: "FDA483_COMMITMENT_ADDED",
      module: "fda-483",
      recordId: liveEvent.id,
    });
    setAddCommitOpen(false);
  }

  function selectEvent(e: FDA483Event | null) {
    setSelectedEvent(e);
    if (!e) setCurrentStep(1);
  }
  function resetWorkflow() {
    setSelectedEvent(null);
    setCurrentStep(1);
  }
  function clearFilters() {
    setTypeFilter("");
    setStatusFilter("");
    setSiteFilter("");
  }

  /* ══════════════════════════════════════ */

  return (
    <main
      id="main-content"
      aria-label="FDA 483 and warning letter support"
      className="w-full space-y-5"
    >
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">FDA 483 &amp; Regulatory Events</h1>
          <p className="page-subtitle mt-1">
            {events.length === 0
              ? "No regulatory events logged yet"
              : `${events.length} events \u00b7 ${openCount} open \u00b7 ${dueCount} response due`}
          </p>
        </div>
        {role !== "viewer" && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } setAddEventOpen(true); }}
          >
            Log event
          </Button>
        )}
      </header>

      {/* Deadline alert */}
      {urgentEvents.length > 0 && (
        <div
          className={clsx(
            "flex items-start gap-3 p-4 rounded-xl border",
            isDark
              ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.25)]"
              : "bg-[#fef2f2] border-[#fca5a5]",
          )}
          role="alert"
        >
          <AlertCircle
            className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#ef4444]">
              {urgentEvents.length} response deadline
              {urgentEvents.length > 1 ? "s" : ""} within 5 days
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {urgentEvents
                .map(
                  (e) =>
                    `${e.referenceNumber}: ${daysLeft(e.responseDeadline)} day(s) remaining`,
                )
                .join(" \u00b7 ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("Response Due"); setCurrentStep(1); }}
          >
            View
          </Button>
        </div>
      )}


      {/* ═══════════ RESPONSE SUMMARY TAB ═══════════ */}
      {/* ═══════════ STEP INDICATOR (display only) ═══════════ */}
      {(() => {
        const steps = [
          { n: 1 as Step, label: "Event",        complete: hasSubmitted || (hasEvent && currentStep > 1) },
          { n: 2 as Step, label: "Observations", complete: hasSubmitted || (hasObservations && currentStep > 2) },
          { n: 3 as Step, label: "RCA",          complete: hasSubmitted || (hasRcaAndCapa && currentStep > 3) },
          { n: 4 as Step, label: "Response",     complete: hasSubmitted },
        ];
        return (
          <div
            className={clsx("flex items-center gap-2 p-3 rounded-xl border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}
            role="progressbar"
            aria-label={`Workflow step ${currentStep} of 4`}
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={4}
          >
            {steps.map((s, i) => {
              const isActive = currentStep === s.n;
              const color = s.complete ? "#10b981" : isActive ? "#0ea5e9" : "#64748b";
              return (
                <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0" aria-current={isActive ? "step" : undefined}>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                      style={{
                        background: s.complete ? color : "transparent",
                        border: `2px solid ${color}`,
                        color: s.complete ? "#fff" : color,
                      }}
                      aria-hidden="true"
                    >
                      {s.complete ? "\u2713" : s.n}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Step {s.n}</p>
                      <p className="text-[12px] font-semibold truncate" style={{ color }}>{s.label}</p>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex-1 h-px" style={{ background: s.complete ? "#10b981" : "var(--bg-border)" }} aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ═══════════ STEP CONTENT ═══════════ */}
      <div>
        {/* STEP 1 — Events list */}
        {currentStep === 1 && (
          <>
            <EventsTab
              events={events}
              filteredEvents={filteredEvents}
              selectedEvent={selectedEvent}
              openCount={openCount}
              dueCount={dueCount}
              closedCount={closedCount}
              typeFilter={typeFilter}
              statusFilter={statusFilter}
              siteFilter={siteFilter}
              anyFilter={anyFilter}
              sites={sites}
              timezone={timezone}
              dateFormat={dateFormat}
              isDark={isDark}
              role={role}
              onTypeFilterChange={setTypeFilter}
              onStatusFilterChange={setStatusFilter}
              onSiteFilterChange={setSiteFilter}
              onClearFilters={clearFilters}
              onSelectEvent={selectEvent}
              onAddEvent={() => setAddEventOpen(true)}
              computeReadiness={computeReadiness}
            />
            <div className="flex justify-end pt-4">
              {hasSubmitted ? (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
                  style={{ background: "var(--success-bg)", color: "var(--success)" }}
                  role="status"
                >
                  <span aria-hidden="true">&#10003;</span>
                  Response submitted &mdash; no further action required
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!liveEvent}
                  onClick={() => setCurrentStep(2)}
                  title={liveEvent ? "" : "Select an event first"}
                >
                  Next: Observations &rarr;
                </Button>
              )}
            </div>
          </>
        )}

                {/* STEP 3 — RCA Workspace */}
                {currentStep === 3 && liveEvent && (
                  <>
                    <RCATab
                      liveEvent={liveEvent}
                      selectedObs={selectedObs}
                      selectedObsId={selectedObsId}
                      isDark={isDark}
                      role={role}
                      whyAnswers={whyAnswers}
                      fishboneAnswers={fishboneAnswers}
                      fishboneRoot={fishboneRoot}
                      freeformRCA={freeformRCA}
                      onGoToEvents={resetWorkflow}
                      onGoToObservations={() => setCurrentStep(2)}
                      onSelectedObsIdChange={setSelectedObsId}
                      onWhyAnswersChange={setWhyAnswers}
                      onFishboneAnswersChange={setFishboneAnswers}
                      onFishboneRootChange={setFishboneRoot}
                      onFreeformRCAChange={setFreeformRCA}
                      onSelectRCAMethod={(method) => {
                        if (!selectedObs) return;
                        dispatch(updateObservation({ eventId: liveEvent.id, obsId: selectedObs.id, patch: { rcaMethod: method } }));
                      }}
                      onSave5Why={() => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        const text = whyAnswers.filter((w) => w.trim()).map((w, i) => `Why ${i + 1}: ${w}`).join("\n");
                        dispatch(updateObservation({ eventId: liveEvent.id, obsId: selectedObs.id, patch: { rootCause: text, status: "Response Drafted" } }));
                        auditLog({ action: "FDA483_RCA_SAVED", module: "fda-483", recordId: selectedObs.id, newValue: { rootCause: text } });
                        setRcaSavedPopup(true);
                      }}
                      onSaveFishbone={() => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        const text = Object.entries(fishboneAnswers).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nRoot cause: ${fishboneRoot}`;
                        dispatch(updateObservation({ eventId: liveEvent.id, obsId: selectedObs.id, patch: { rootCause: text, status: "Response Drafted" } }));
                        auditLog({ action: "FDA483_RCA_SAVED", module: "fda-483", recordId: selectedObs.id });
                        setRcaSavedPopup(true);
                      }}
                      onSaveFreeform={() => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        dispatch(updateObservation({ eventId: liveEvent.id, obsId: selectedObs.id, patch: { rootCause: freeformRCA.trim(), status: "Response Drafted" } }));
                        auditLog({ action: "FDA483_RCA_SAVED", module: "fda-483", recordId: selectedObs.id });
                        setRcaSavedPopup(true);
                      }}
                      onRaiseCAPA={() => {
                        if (!selectedObs) return;
                        const capaId = `CAPA-${String(Date.now()).slice(-4)}`;
                        dispatch(addCAPA({
                          id: capaId, tenantId: tenantId ?? "", siteId: liveEvent.siteId,
                          source: "483", risk: selectedObs.severity, owner: user?.id ?? "",
                          dueDate: liveEvent.responseDeadline, status: "Open",
                          description: `${liveEvent.referenceNumber} Obs #${selectedObs.number}: ${selectedObs.text}`,
                          rca: selectedObs.rootCause ?? "",
                          rcaMethod: selectedObs.rcaMethod as "5 Why" | "Fishbone" | "Fault Tree" | "Other" | undefined,
                          correctiveActions: "", effectivenessCheck: selectedObs.severity === "Critical",
                          evidenceLinks: [], diGate: false, createdAt: "",
                        }));
                        dispatch(updateObservation({ eventId: liveEvent.id, obsId: selectedObs.id, patch: { capaId } }));
                        auditLog({ action: "CAPA_RAISED_FROM_483", module: "fda-483", recordId: selectedObs.id, newValue: { capaId } });
                        setCapaRaisedPopup(true);
                      }}
                    />
                    <div className="flex justify-between pt-4">
                      <Button variant="secondary" size="sm" onClick={() => setCurrentStep(2)}>&larr; Back</Button>
                      <Button variant="primary" size="sm" disabled={!hasRcaAndCapa} onClick={() => setCurrentStep(4)} title={hasRcaAndCapa ? "" : "Save RCA and raise CAPA for every observation first"}>Next: Response &rarr;</Button>
                    </div>
                  </>
                )}

                {/* STEP 2 — Observations */}
                {currentStep === 2 && liveEvent && (
                  <>
                    <ObservationsTab
                      liveEvent={liveEvent}
                      capas={capas}
                      sites={sites}
                      timezone={timezone}
                      dateFormat={dateFormat}
                      isDark={isDark}
                      role={role}
                      ownerName={ownerName}
                      onGoToEvents={resetWorkflow}
                      onAddObservation={() => { setEditingObs(null); setAddObsOpen(true); }}
                      onEditObservation={(obs) => { setEditingObs(obs); setAddObsOpen(true); }}
                      onAddCommitment={() => setAddCommitOpen(true)}
                      onGoToResponse={() => setCurrentStep(3)}
                    />
                    <div className="flex justify-between pt-4">
                      <Button variant="secondary" size="sm" onClick={() => setCurrentStep(1)}>&larr; Back</Button>
                      <Button variant="primary" size="sm" disabled={!hasObservations} onClick={() => setCurrentStep(3)} title={hasObservations ? "" : "Add at least one observation before proceeding to RCA"}>Next: RCA &rarr;</Button>
                    </div>
                  </>
                )}

                {/* STEP 4 — Response */}
                {currentStep === 4 && liveEvent && (
                  <>
                    <ResponseTab
          liveEvent={liveEvent}
          capas={capas}
          isDark={isDark}
          role={role}
          canSign={canSign}
          canSubmit={canSubmitResponse}
          agiMode={agiMode}
          agiAgent={agiAgent}
          timezone={timezone}
          dateFormat={dateFormat}
          responseText={responseText}
          editingResponse={editingResponse}
          ownerName={ownerName}
          onGoToEvents={resetWorkflow}
          onResponseTextChange={setResponseText}
          onEditResponseToggle={() => {
            if (editingResponse)
              setResponseText(liveEvent?.responseDraft ?? "");
            setEditingResponse((v) => !v);
          }}
          onCancelEdit={() => {
            setResponseText(liveEvent?.responseDraft ?? "");
            setEditingResponse(false);
          }}
          onSaveDraft={() => {
            if (!liveEvent) return;
            dispatch(
              setResponseDraft({
                eventId: liveEvent.id,
                text: responseText.trim(),
              }),
            );
            auditLog({
              action: "FDA483_RESPONSE_DRAFT_SAVED",
              module: "fda-483",
              recordId: liveEvent.id,
            });
            setEditingResponse(false);
            setResponseSavedPopup(true);
          }}
          onUseAGIDraft={() => {
            if (!liveEvent) return;
            dispatch(
              setResponseDraft({
                eventId: liveEvent.id,
                text: liveEvent.agiDraft,
              }),
            );
            setResponseText(liveEvent.agiDraft);
            setEditingResponse(true);
          }}
          onGenerateAGIDraft={() => {
            if (!liveEvent) return;
            const obsText = liveEvent.observations
              .map((o) => `Obs ${o.number}: ${o.text}`)
              .join("\n");
            const capaText = liveEvent.observations
              .filter((o) => o.capaId)
              .map((o) => {
                const c = capas.find((cp) => cp.id === o.capaId);
                return c
                  ? `${o.capaId}: ${c.description} \u2014 ${c.correctiveActions || "In progress"}`
                  : o.capaId;
              })
              .join("\n");
            dispatch(
              setAGIDraft({
                eventId: liveEvent.id,
                text: `REGULATORY RESPONSE \u2014 ${liveEvent.referenceNumber}\n\nDear ${liveEvent.agency},\n\nWe have received and reviewed the ${liveEvent.type} dated ${dayjs.utc(liveEvent.inspectionDate).format(dateFormat)}. We take these observations seriously and have initiated corrective actions as described below.\n\nOBSERVATIONS AND CORRECTIVE ACTIONS:\n\n${obsText}\n\nLINKED CAPAs:\n\n${capaText || "CAPAs being raised."}\n\nRespectfully submitted,\n[QA Head]\n[Company Name]`,
              }),
            );
          }}
          onSignSubmit={() => setSignOpen(true)}
                    />
                    <div className="flex justify-start pt-4">
                      <Button variant="secondary" size="sm" onClick={() => setCurrentStep(3)}>&larr; Back</Button>
                    </div>
                  </>
                )}
      </div>

      {/* ── Modals ── */}
      <AddEventModal
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSave={onEventSave}
        sites={sites}
        lockedSiteId={selectedSiteId}
      />
      <AddObservationModal
        open={addObsOpen}
        editingObs={editingObs}
        defaultNumber={(liveEvent?.observations.length ?? 0) + 1}
        onClose={() => { setAddObsOpen(false); setEditingObs(null); }}
        onSave={onObsSave}
      />
      <AddCommitmentModal
        open={addCommitOpen}
        onClose={() => setAddCommitOpen(false)}
        onSave={onCommitSave}
        users={complianceUsers}
      />
      <SignSubmitModal
        open={signOpen}
        liveEvent={liveEvent}
        isDark={isDark}
        signMeaning={signMeaning}
        signPassword={signPassword}
        onClose={() => setSignOpen(false)}
        onSignMeaningChange={setSignMeaning}
        onSignPasswordChange={setSignPassword}
        onSubmit={() => {
          if (!liveEvent) return;
          dispatch(
            updateEvent({
              id: liveEvent.id,
              patch: {
                status: "Response Submitted",
                submittedAt: dayjs().toISOString(),
                submittedBy: user?.id ?? "",
                signatureMeaning: signMeaning,
              },
            }),
          );
          auditLog({
            action: "FDA483_RESPONSE_SUBMITTED",
            module: "fda-483",
            recordId: liveEvent.id,
            newValue: { submittedBy: user?.id, meaning: signMeaning },
          });
          setSignOpen(false);
          setSignedPopup(true);
          setSignMeaning("");
          setSignPassword("");
          // Stay on the current event so the user sees the submitted success view
        }}
      />

      {/* ── Popups ── */}
      <Popup
        isOpen={eventAddedPopup}
        variant="success"
        title="Event logged"
        description="Add observations and start drafting your response."
        onDismiss={() => setEventAddedPopup(false)}
      />
      <Popup
        isOpen={obsAddedPopup}
        variant="success"
        title="Observation saved"
        description="Open RCA Workspace to document root cause."
        onDismiss={() => setObsAddedPopup(false)}
      />
      <Popup
        isOpen={responseSavedPopup}
        variant="success"
        title="Response draft saved"
        description="Sign & Submit when QA Head is ready."
        onDismiss={() => setResponseSavedPopup(false)}
      />
      <Popup
        isOpen={signedPopup}
        variant="success"
        title="Response submitted"
        description="Signed and submitted. Audit trail recorded."
        onDismiss={() => setSignedPopup(false)}
      />
      <Popup
        isOpen={rcaSavedPopup}
        variant="success"
        title="RCA saved successfully"
        description="Root cause analysis saved. Observation status updated."
        onDismiss={() => setRcaSavedPopup(false)}
      />
      <Popup
        isOpen={capaRaisedPopup}
        variant="success"
        title="CAPA raised successfully"
        description="Proceed to Observations tab to add a commitment."
        onDismiss={() => setCapaRaisedPopup(false)}
      />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="FDA 483 events" />
    </main>
  );
}
