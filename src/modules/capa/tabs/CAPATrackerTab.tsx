import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/hooks/useAppSelector";
import { ClipboardCheck, Plus, Search, ChevronRight, Link2, CheckCircle2, Sparkles } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA, CAPARisk } from "@/store/capa.slice";
import { isOverdue, STATUS_LABEL, type CAPAStatus } from "@/types/capa";
import type { AuthUser } from "@/store/auth.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { CAPA_STATUS_VARIANT, getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { CAPADetailModal } from "../modals/CAPADetailModal";

/* ── Helpers ── */
const SOURCE_LABEL: Record<string, string> = { "483": "FDA 483 Observation", "Gap Assessment": "Gap Assessment Finding", Deviation: "Deviation Report", "Internal Audit": "Internal Audit", Complaint: "Complaint", OOS: "OOS", "Change Control": "Change Control" };
function sourceLabel(s: string) { return SOURCE_LABEL[s] ?? s; }
function riskBadge(r: CAPARisk) { return <Badge variant={getSeverityVariant(r, "generic")}>{normalizeSeverityForDisplay(r, "generic") ?? r}</Badge>; }
function capaStatusBadge(s: CAPAStatus) { return <Badge variant={CAPA_STATUS_VARIANT[s]}>{STATUS_LABEL[s]}</Badge>; }
function ownerName(uid: string, users: UserConfig[]) { return users.find((u) => u.id === uid)?.name ?? uid; }

interface SiteOption {
  id: string;
  name: string;
}

interface CAPATrackerTabProps {
  capas: CAPA[];
  filteredCAPAs: CAPA[];
  selectedCAPA: CAPA | null;
  onSelectCAPA: (c: CAPA | null) => void;
  isDark: boolean;
  isViewOnly: boolean;
  users: UserConfig[];
  user: AuthUser | null;
  sites: SiteOption[];
  timezone: string;
  dateFormat: string;
  onAddOpen: () => void;
  /** AI CAPA modal trigger — optional. CAPAPage passes this only when
   *  the current user is allowed to use AI CAPA generation. */
  onAiOpen?: () => void;
  onEditOpen: () => void;
  /** Substage 6.4 — optional CC-block override from ActionsPanel's
   *  pre-flight gate. CAPAPage forwards it into signAndCloseCAPA. */
  onSignOpen: (override?: { reason: string }) => void;
  onSubmitForReview: (id: string) => void;
  onNavigateGap: (findingId: string) => void;
  onNavigateCapa: () => void;
}

export function CAPATrackerTab({
  capas, filteredCAPAs, selectedCAPA, onSelectCAPA,
  isDark, isViewOnly, users, user, sites, timezone, dateFormat,
  onAddOpen, onAiOpen, onEditOpen, onSignOpen, onSubmitForReview,
  onNavigateGap, onNavigateCapa,
}: CAPATrackerTabProps) {
  const router = useRouter();
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const showSiteColumn = !selectedSiteId && sites.length > 1;
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const anyFilterActive = !!(search || siteFilter || statusFilter || riskFilter || sourceFilter);
  function clearFilters() { setSearch(""); setSiteFilter(""); setStatusFilter(""); setRiskFilter(""); setSourceFilter(""); }

  // Defense-in-depth: dedupe by id alongside the filter pass. The slice's
  // addCAPA reducer already upserts on id (see capa.slice.ts), so dupes
  // shouldn't reach here — but per the AI integration spec a table-level
  // Set guard is mandated as a belt-and-braces against any future regression.
  const seenIds = new Set<string>();
  const displayed = filteredCAPAs.filter((c) => {
    if (siteFilter && c.siteId !== siteFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (riskFilter && c.risk !== riskFilter) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      // Match against the human-readable reference first (what users see),
      // the raw cuid (for copy-paste from logs), and the description.
      const referenceMatch = c.reference?.toLowerCase().includes(q) ?? false;
      const idMatch = c.id.toLowerCase().includes(q);
      const descriptionMatch = c.description.toLowerCase().includes(q);
      if (!referenceMatch && !idMatch && !descriptionMatch) return false;
    }
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  return (
    <div role="tabpanel" id="panel-tracker" aria-labelledby="tab-tracker" tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search CAPAs…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search CAPAs" />
        </div>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-40" options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, { value: "open", label: STATUS_LABEL.open }, { value: "in_progress", label: STATUS_LABEL.in_progress }, { value: "pending_qa_review", label: STATUS_LABEL.pending_qa_review }, { value: "closed", label: STATUS_LABEL.closed }]} />
        <Dropdown placeholder="All risks" value={riskFilter} onChange={setRiskFilter} width="w-32" options={[{ value: "", label: "All risks" }, { value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />
        <Dropdown placeholder="All sources" value={sourceFilter} onChange={setSourceFilter} width="w-40" options={[{ value: "", label: "All sources" }, { value: "483", label: "483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />
        {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        {!isViewOnly && onAiOpen && <Button variant="secondary" size="sm" icon={Sparkles} onClick={onAiOpen}>AI CAPA</Button>}
        {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} onClick={onAddOpen}>New CAPA</Button>}
      </div>

      {/* Table — always full width */}
      <div className="overflow-x-auto">
        {displayed.length === 0 ? (
          <div className="card p-8 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            {capas.length === 0 ? (
              <>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No CAPAs raised yet</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>CAPAs are raised from Gap Assessment findings, or you can create one manually.</p>
                <div className="flex gap-3 justify-center mt-3">
                  {!isViewOnly && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Create CAPA</Button>}
                  <Button variant="ghost" onClick={onNavigateCapa}>Go to Gap Assessment</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No CAPAs match the current filters</p>
                {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2">Clear filters</Button>}
              </>
            )}
          </div>
        ) : (
          <table className="data-table" aria-label="CAPA register">
            <caption className="sr-only">Corrective and preventive actions with RCA, status and closure tracking</caption>
            <thead><tr>
              <th scope="col">Reference</th>
              {showSiteColumn && <th scope="col">Site</th>}
              <th scope="col">Source</th><th scope="col">Description</th>
              <th scope="col">Risk</th><th scope="col">Status</th><th scope="col">Owner</th>
              <th scope="col">Due date</th><th scope="col" title="90-day effectiveness check status">Effectiveness</th><th scope="col"><span className="sr-only">Open</span></th>
            </tr></thead>
            <tbody>
              {displayed.map((c) => {
                // Mirrors CAPADetailModal: prefer the per-tenant reference;
                // fall back to a stable legacy label rather than exposing the
                // raw cuid, which carries no domain meaning. The cuid stays
                // available on hover (title) for support / log lookups.
                const referenceDisplay = c.reference ?? `CAPA-LEGACY-${c.id.slice(0, 8)}`;
                return (
                <tr key={c.id} onClick={() => onSelectCAPA(c)} className="cursor-pointer" aria-selected={selectedCAPA?.id === c.id}
                  style={selectedCAPA?.id === c.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}>
                  <th scope="row">
                    <div
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                      title={c.id}
                    >
                      {referenceDisplay}
                    </div>
                    {c.findingId && <div className="flex items-center gap-1 mt-0.5"><Link2 className="w-3 h-3 text-[#0ea5e9]" aria-hidden="true" /><span className="text-[10px] text-[#0ea5e9]">{c.findingId}</span></div>}
                  </th>
                  {showSiteColumn && <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{siteName(c.siteId)}</td>}
                  <td><Badge variant="gray">{sourceLabel(c.source)}</Badge></td>
                  <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }}>{c.description}</span></td>
                  <td>{riskBadge(c.risk)}</td>
                  <td>{capaStatusBadge(c.status)}</td>
                  <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{ownerName(c.owner, users)}</td>
                  <td className="whitespace-nowrap">
                    <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(c.dueDate).tz(timezone).format(dateFormat)}</div>
                    {isOverdue(c) && <div className="text-[10px] text-[#ef4444] font-medium">Overdue</div>}
                  </td>
                  <td>{c.effectivenessCheck ? <CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-label="Effectiveness check planned" /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {/* AI Lifecycle — opens /ai-capa/<reference> in the
                          AI-managed lifecycle dashboard. stopPropagation so
                          the row's onClick (which opens the detail modal)
                          doesn't fire as well. The button is shown for every
                          row; if the CAPA isn't AI-tracked the lifecycle page
                          surfaces an empty-state for the missing record. */}
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={Sparkles}
                        aria-label={`Open ${referenceDisplay} in AI lifecycle`}
                        title="Open AI lifecycle"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/ai-capa/${encodeURIComponent(c.reference ?? c.id)}`);
                        }}
                      />
                      <Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View ${referenceDisplay} detail`} />
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CAPA detail modal — extracted into its own component, see
       *  src/modules/capa/modals/CAPADetailModal.tsx. The modal does its
       *  own role gating (useRole), evidence-counts wiring, and tab
       *  management; this tracker only owns selection + edit/sign trigger
       *  state. */}
      {selectedCAPA && (
        <CAPADetailModal
          capa={selectedCAPA}
          isDark={isDark}
          user={user}
          users={users}
          timezone={timezone}
          dateFormat={dateFormat}
          onClose={() => onSelectCAPA(null)}
          onEditOpen={onEditOpen}
          onSignOpen={onSignOpen}
          onSubmitForReview={onSubmitForReview}
          onNavigateGap={onNavigateGap}
        />
      )}
    </div>
  );
}
