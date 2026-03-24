import { useState } from "react";
import { Search, Download, Package, FileText, File, Database, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";

const DOCUMENTS = [
  { id: "DOC-001", name: "LIMS Audit Trail Report — Dec 2025 to Mar 2026", area: "QC Lab", type: "Audit Trail", system: "LIMS", date: "17 Mar 2026", tags: ["Part 11", "DI"], status: "Verified" },
  { id: "DOC-002", name: "CAPA-0042 Action Plan and RCA Report", area: "QMS", type: "CAPA Record", system: "QMS", date: "01 Mar 2026", tags: ["CAPA", "FDA 483"], status: "Verified" },
  { id: "DOC-003", name: "Empower 3 CDS — System Description and Risk Assessment", area: "CSV/IT", type: "Validation", system: "CDS", date: "10 Mar 2026", tags: ["GAMP 5", "Part 11"], status: "Pending Review" },
  { id: "DOC-004", name: "Training Completion Matrix — QC Analysts Q1 2026", area: "Training", type: "Training Record", system: "LMS", date: "15 Mar 2026", tags: ["Training"], status: "Verified" },
  { id: "DOC-005", name: "SOP-QC-044 Rev 5 — OOS/OOT Investigation Procedure", area: "QC Lab", type: "SOP", system: "eDMS", date: "05 Jan 2026", tags: ["SOP", "OOS"], status: "Verified" },
  { id: "DOC-006", name: "Temperature Excursion Log — Warehouse Q1 2026", area: "Warehouse", type: "Record", system: "MES", date: "12 Mar 2026", tags: ["GMP", "Deviation"], status: "Pending Review" },
  { id: "DOC-007", name: "Annual Supplier Qualification Review — API Vendors 2025", area: "Manufacturing", type: "Report", system: "QMS", date: "20 Feb 2026", tags: ["Supplier", "Qualification"], status: "Verified" },
  { id: "DOC-008", name: "Batch Record Template v4 — Oral Solids Mumbai", area: "Manufacturing", type: "Record", system: "MES", date: "08 Mar 2026", tags: ["Batch", "eBR"], status: "Pending Review" },
  { id: "DOC-009", name: "Environmental Monitoring SOP-EM-003 Periodic Review", area: "Utilities", type: "SOP", system: "eDMS", date: "14 Feb 2026", tags: ["SOP", "EM"], status: "Verified" },
  { id: "DOC-010", name: "Part 11 Gap Assessment Report — Site-wide 2026", area: "CSV/IT", type: "Report", system: "QMS", date: "25 Feb 2026", tags: ["Part 11", "Gap Assessment"], status: "Verified" },
];

const TYPE_ICON: Record<string, typeof FileText> = {
  "Audit Trail": Database,
  "CAPA Record": CheckSquare,
  "Validation": File,
  "Training Record": FileText,
  "SOP": FileText,
  "Record": File,
  "Report": FileText,
};

const STATUS_COLOR: Record<string, string> = {
  Verified: "badge-green",
  "Pending Review": "badge-amber",
};

export function EvidencePage() {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packMode, setPackMode] = useState(false);

  const filtered = DOCUMENTS.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase()) || d.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchArea = !areaFilter || d.area === areaFilter;
    const matchType = !typeFilter || d.type === typeFilter;
    return matchSearch && matchArea && matchType;
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectedDocs = DOCUMENTS.filter((d) => selected.has(d.id));

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Evidence &amp; Document Workspace</h1>
          <p className="page-subtitle mt-1">Search, review and build evidence packs for inspection readiness</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={Package} onClick={() => setPackMode(!packMode)}>
            {packMode ? "Exit Pack Builder" : "Evidence Pack Builder"}
          </Button>
          {packMode && selected.size > 0 && (
            <Button size="sm" icon={Download}>Generate Pack ({selected.size})</Button>
          )}
        </div>
      </header>

      {/* Pack mode banner */}
      {packMode && (
        <div className="alert alert-info text-sm flex items-center gap-2">
          <Package className="w-4 h-4 shrink-0" />
          Pack Builder active — select documents below to include in your evidence pack. Pack will include metadata, hash, and version information.
          {selected.size > 0 && <span className="ml-auto font-semibold">{selected.size} selected</span>}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-(--text-muted) shrink-0" />
          <input className="input text-sm py-1.5" placeholder="Search documents, tags, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select text-sm py-1.5 w-auto" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="">All areas</option>
          {["QC Lab", "QMS", "CSV/IT", "Training", "Warehouse", "Manufacturing", "Utilities"].map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className="select text-sm py-1.5 w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {["Audit Trail", "CAPA Record", "Validation", "Training Record", "SOP", "Record", "Report"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <span className="text-xs text-(--text-muted)">{filtered.length} documents</span>
      </div>

      {/* Document grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((doc) => {
          const Icon = TYPE_ICON[doc.type] ?? FileText;
          const isSelected = selected.has(doc.id);
          return (
            <div
              key={doc.id}
              className={`card p-4 cursor-pointer transition-all duration-150 ${packMode ? "hover:border-(--brand)" : ""} ${isSelected ? "border-(--brand) bg-(--brand-muted)" : ""}`}
              onClick={() => packMode && toggle(doc.id)}
            >
              <div className="flex items-start gap-3">
                {packMode && (
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? "bg-(--brand) border-(--brand)" : "border-(--bg-border)"}`}>
                    {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                )}
                <div className="p-2 rounded-lg shrink-0" style={{ background: "var(--bg-elevated)" }}>
                  <Icon className="w-4 h-4 text-(--brand)" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug text-(--text-primary) line-clamp-2">{doc.name}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="badge badge-gray text-[10px]">{doc.area}</span>
                    <span className="badge badge-gray text-[10px]">{doc.type}</span>
                    <span className={`badge ${STATUS_COLOR[doc.status]} text-[10px]`}>{doc.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-(--text-muted)">
                    <span className="font-mono">{doc.id}</span>
                    <span>{doc.system}</span>
                    <span>{doc.date}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {doc.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-(--text-muted) text-sm">No documents match your search.</div>
      )}

      {/* Pack preview */}
      {packMode && selected.size > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Evidence pack preview — {selected.size} documents</h2>
            <Button size="sm" icon={Download}>Generate pack</Button>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Document</th><th>Area</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {selectedDocs.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs text-(--brand)">{d.id}</td>
                    <td className="text-sm">{d.name}</td>
                    <td className="text-xs">{d.area}</td>
                    <td className="text-xs">{d.type}</td>
                    <td><span className={`badge ${STATUS_COLOR[d.status]}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-xs text-(--text-muted)">
              Pack will include: document metadata · SHA-256 hash · version number · retrieval timestamp · compliance tags
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
