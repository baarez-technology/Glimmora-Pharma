import { useState } from "react";
import { useNavigate } from "react-router";
import {
  MapPin,
  Search,
  X,
  Building2,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { setActiveSite } from "@/store/auth.slice";
import type { SiteConfig } from "@/store/settings.slice";

const riskStyles = {
  HIGH: {
    iconBg: "rgba(239,68,68,0.08)",
    iconColor: "#dc2626",
    badgeBg: "rgba(239,68,68,0.08)",
    badgeColor: "#dc2626",
  },
  MEDIUM: {
    iconBg: "rgba(217,119,6,0.08)",
    iconColor: "#d97706",
    badgeBg: "rgba(217,119,6,0.08)",
    badgeColor: "#d97706",
  },
  LOW: {
    iconBg: "rgba(5,150,105,0.08)",
    iconColor: "#059669",
    badgeBg: "rgba(5,150,105,0.08)",
    badgeColor: "#059669",
  },
};

export function SitePicker() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const sites = useAppSelector((s) => s.settings.sites);
  const [selectedSite, setSelectedSite] = useState<SiteConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = sites.filter(
    (s) =>
      s.status === "Active" &&
      s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleEnter = () => {
    if (!selectedSite) return;
    dispatch(setActiveSite(selectedSite.id));
    navigate("/");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "rgba(48,45,41,0.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-[520px] flex flex-col overflow-hidden rounded-2xl max-h-[90vh]"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--bg-border)",
          boxShadow: "var(--shadow-modal)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-picker-title"
      >
        {/* header */}
        <div
          className="flex items-start justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--bg-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(139,105,20,0.1)", border: "1px solid rgba(139,105,20,0.2)" }}
            >
              <MapPin className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="site-picker-title"
                className="text-[15px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Select your site
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Choose the facility you are working from today
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-colors duration-150"
            style={{ background: "transparent", color: "var(--text-muted)" }}
          >
            <X className="w-[14px] h-[14px]" aria-hidden="true" />
          </button>
        </div>

        {/* search */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
          <Input
            id="site-search"
            type="search"
            icon={Search}
            placeholder="Search sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* sites list */}
        <div
          className="px-4 py-3 overflow-y-auto flex-1 max-h-[340px]"
          role="list"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Info className="w-8 h-8" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <p className="text-[13px] text-center" style={{ color: "var(--text-secondary)" }}>
                {searchQuery
                  ? "No sites match your search."
                  : "No active sites configured. Ask your admin to add sites in Settings."}
              </p>
            </div>
          ) : (
            filtered.map((site) => {
              const risk = riskStyles[site.risk];
              const isSelected = selectedSite?.id === site.id;
              return (
                <div key={site.id} role="listitem" className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSite(site)}
                    aria-pressed={isSelected}
                    aria-label={`${site.name} — ${site.risk} risk`}
                    className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 outline-none text-left"
                    style={{
                      background: isSelected ? "var(--brand-muted)" : "transparent",
                      border: isSelected ? "1px solid var(--brand-border)" : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--bg-hover)";
                        e.currentTarget.style.border = "1px solid var(--bg-border)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.border = "1px solid transparent";
                      }
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: risk.iconBg }}
                    >
                      <Building2
                        className="w-4 h-4"
                        style={{ color: risk.iconColor }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {site.name}
                      </p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                        {site.location} · {site.gmpScope}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: risk.badgeBg, color: risk.badgeColor }}
                      >
                        {site.risk}
                      </span>
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center transition-all"
                        style={{
                          border: isSelected ? "2px solid var(--brand)" : "2px solid var(--bg-border)",
                        }}
                      >
                        {isSelected && (
                          <Check
                            className="w-2.5 h-2.5"
                            style={{ color: "var(--brand)" }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* footer */}
        <div
          className="flex items-center justify-between px-4 py-3.5"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {selectedSite ? `${selectedSite.name} selected` : "No site selected"}
          </span>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!selectedSite}
            aria-label={
              selectedSite
                ? `Enter platform at ${selectedSite.name}`
                : "Select a site to continue"
            }
            className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[12px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed"
            style={{
              background: selectedSite ? "var(--brand)" : "var(--bg-border)",
              color: selectedSite ? "#ffffff" : "var(--text-muted)",
              border: "none",
              cursor: selectedSite ? "pointer" : "not-allowed",
            }}
          >
            Enter platform
            <ArrowRight className="w-[13px] h-[13px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
