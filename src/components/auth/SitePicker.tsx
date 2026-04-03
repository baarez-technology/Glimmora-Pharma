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
    iconBg: "bg-[rgba(239,68,68,0.12)]",
    iconColor: "text-[#c0392b]",
    badgeBg: "bg-[rgba(239,68,68,0.12)]",
    badgeColor: "text-[#c0392b]",
  },
  MEDIUM: {
    iconBg: "bg-[rgba(245,158,11,0.12)]",
    iconColor: "text-[#c9a84c]",
    badgeBg: "bg-[rgba(245,158,11,0.12)]",
    badgeColor: "text-[#c9a84c]",
  },
  LOW: {
    iconBg: "bg-[rgba(16,185,129,0.12)]",
    iconColor: "text-[#4a5e3a]",
    badgeBg: "bg-[rgba(16,185,129,0.12)]",
    badgeColor: "text-[#4a5e3a]",
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[rgba(40,32,28,0.85)]">
      <div
        className="w-full max-w-[520px] flex flex-col overflow-hidden bg-[#3a2d28] border border-[#6b5349] rounded-2xl max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-picker-title"
      >
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#0f2039]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0 bg-[rgba(14,165,233,0.12)] border border-[rgba(14,165,233,0.2)]">
              <MapPin className="w-4 h-4 text-[#a57865]" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="site-picker-title"
                className="text-[15px] font-bold text-[#e2e8f0]"
              >
                Select your site
              </h2>
              <p className="text-[12px] text-[#8e7065] mt-0.5">
                Choose the facility you are working from today
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-[#503e37] border-none cursor-pointer transition-colors duration-150"
          >
            <X className="w-[14px] h-[14px] text-[#8e7065]" aria-hidden="true" />
          </button>
        </div>

        {/* search */}
        <div className="px-4 py-3 border-b border-[#0f2039]">
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
              <Info className="w-8 h-8 text-[#6b5349]" aria-hidden="true" />
              <p className="text-[13px] text-[#8e7065] text-center">
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
                    className={`w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all duration-150 outline-none text-left focus-visible:ring-2 focus-visible:ring-[#a57865] ${
                      isSelected
                        ? "bg-[#0c2f5a] border-[#a57865]"
                        : "bg-transparent border-transparent hover:bg-[#503e37] hover:border-[#6b5349]"
                    }`}
                  >
                    {/* site icon */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${risk.iconBg}`}
                    >
                      <Building2
                        className={`w-4 h-4 ${risk.iconColor}`}
                        aria-hidden="true"
                      />
                    </div>

                    {/* site info */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-semibold text-[#e2e8f0] truncate">
                        {site.name}
                      </p>
                      <p className="text-[11px] text-[#8e7065] mt-0.5 truncate">
                        {site.location} · {site.gmpScope}
                      </p>
                    </div>

                    {/* right side */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${risk.badgeBg} ${risk.badgeColor}`}
                      >
                        {site.risk}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? "border-[#a57865]"
                            : "border-[#6b5349]"
                        }`}
                      >
                        {isSelected && (
                          <Check
                            className="w-2.5 h-2.5 text-[#a57865]"
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
        <div className="flex items-center justify-between px-4 py-3.5 border-t border-[#0f2039]">
          <span className="text-[11px] text-[#8e7065]">
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
            className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[12px] font-semibold transition-colors duration-150 enabled:bg-[#a57865] enabled:text-white enabled:hover:bg-[#8a6050] disabled:bg-[#6b5349] disabled:text-[#8e7065] disabled:cursor-not-allowed"
          >
            Enter platform
            <ArrowRight className="w-[13px] h-[13px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
