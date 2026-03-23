import { Bell } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole, ROLE_LABELS } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const roleBadge: Record<UserRole, string> = {
  super_admin: "bg-[rgba(239,68,68,0.12)] text-[#ef4444]",
  qa_head: "bg-[rgba(139,92,246,0.12)] text-[#a78bfa]",
  qc_lab_director: "bg-[rgba(16,185,129,0.12)] text-[#10b981]",
  regulatory_affairs: "bg-[rgba(236,72,153,0.12)] text-[#f472b6]",
  csv_val_lead: "bg-[rgba(14,165,233,0.12)] text-[#38bdf8]",
  it_cdo: "bg-[rgba(20,184,166,0.12)] text-[#2dd4bf]",
  operations_head: "bg-[rgba(245,158,11,0.12)] text-[#f59e0b]",
  viewer: "bg-[rgba(148,163,184,0.1)] text-[#94a3b8]",
};

export function Topbar() {
  const companyName = useAppSelector((s) => s.settings.org.companyName);
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header
      role="banner"
      className="flex items-center justify-between px-6 py-3 bg-(--bg-surface) border-b border-(--bg-border)"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-(--text-primary)">
          {companyName || "Pharma Glimmora"}
        </span>
        <span className="badge-green text-xs font-semibold px-2 py-0.5 rounded-full">
          GxP Live
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex items-center justify-center rounded-lg p-2 transition-colors bg-(--bg-elevated) border border-(--bg-border) text-(--text-secondary)"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-(--danger)"
          />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-[12px] font-medium text-(--text-primary)">
              {user?.name}
            </span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleBadge[role]}`}
            >
              {ROLE_LABELS[role]}
            </span>
          </div>

          <div
            aria-label={user?.name ?? "User avatar"}
            className="flex items-center justify-center rounded-full text-xs font-semibold w-8 h-8 bg-(--brand-muted) text-(--brand) border border-(--brand-border)"
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
