import { Bell, Search, HelpCircle, Calendar, Clock, Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole, ROLE_LABELS } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ColorThemePicker } from "@/components/ui/ColorThemePicker";
import dayjs from "@/lib/dayjs";

const roleBadge: Record<UserRole, { bg: string; color: string }> = {
  super_admin:        { bg: "rgba(192,57,43,0.12)",   color: "#c0392b" },
  qa_head:            { bg: "rgba(123,104,165,0.12)", color: "#7b68a5" },
  qc_lab_director:    { bg: "rgba(74,94,58,0.12)",    color: "#4a5e3a" },
  regulatory_affairs: { bg: "rgba(165,120,101,0.12)", color: "#a57865" },
  csv_val_lead:       { bg: "rgba(74,143,168,0.12)",  color: "#4a8fa8" },
  it_cdo:             { bg: "rgba(110,76,62,0.12)",   color: "#6e4c3e" },
  operations_head:    { bg: "rgba(201,168,76,0.12)",  color: "#c9a84c" },
  viewer:             { bg: "rgba(142,112,101,0.10)", color: "#8e7065" },
};

function DateTimeBlock() {
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <Calendar size={13} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Date</span>
        <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
          {now.format("DD MMM YYYY")}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <Clock size={13} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Time</span>
        <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
          {now.format("h:mm A")}
        </span>
      </div>
    </div>
  );
}

export function Topbar() {
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const badge = roleBadge[role as UserRole] ?? roleBadge.viewer;

  return (
    <header
      role="banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 64,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--bg-border)",
      }}
    >
      {/* Hamburger */}
      <button
        type="button"
        aria-label="Toggle sidebar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          flexShrink: 0,
        }}
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {/* Date / Time */}
      <DateTimeBlock />

      {/* Search */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            maxWidth: 420,
            padding: "0 12px",
            height: 36,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            cursor: "text",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--brand)";
            el.style.boxShadow = "0 0 0 3px var(--brand-muted)";
          }}
          onBlur={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--bg-border)";
            el.style.boxShadow = "none";
          }}
        >
          <Search size={14} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="search"
            aria-label="Search modules, CAPAs, findings"
            placeholder="Search..."
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          />
          <kbd
            aria-hidden="true"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              background: "var(--bg-border)",
              padding: "2px 6px",
              borderRadius: 4,
              fontFamily: "IBM Plex Mono, monospace",
              flexShrink: 0,
            }}
          >
            Ctrl K
          </kbd>
        </label>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <ColorThemePicker />
        <ThemeToggle />

        {/* Help */}
        <button
          type="button"
          aria-label="Help and documentation"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s",
            background: "var(--brand)",
            border: "none",
            color: "#ffffff",
          }}
        >
          <HelpCircle size={13} aria-hidden="true" />
          Help
        </button>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s",
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            color: "var(--text-secondary)",
          }}
        >
          <Bell size={15} aria-hidden="true" />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 7,
              right: 7,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--danger)",
            }}
          />
        </button>

        {/* Divider */}
        <div aria-hidden="true" style={{ width: 1, height: 28, background: "var(--bg-border)", margin: "0 4px" }} />

        {/* User avatar + name + role */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-label={user?.name ?? "User avatar"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "50%",
              fontSize: 12,
              fontWeight: 700,
              background: badge.bg,
              color: badge.color,
              border: `2px solid ${badge.color}30`,
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
              {user?.name ?? "—"}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              {ROLE_LABELS[role as UserRole]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
