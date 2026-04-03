import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Monitor,
  Map,
  Bot,
  FileText,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronDown,
  Layers,
  FlaskConical,
  Cpu,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useActiveSite } from "@/hooks/useActiveSite";
import { logout } from "@/store/auth.slice";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "qms",
    label: "QMS & Compliance",
    icon: Layers,
    items: [
      { path: "/",              label: "Dashboard",      icon: LayoutDashboard },
      { path: "gap-assessment", label: "Gap Assessment", icon: Search },
      { path: "capa",           label: "CAPA Tracker",   icon: ClipboardList },
      { path: "evidence",       label: "Evidence",       icon: FileText },
    ],
  },
  {
    id: "validation",
    label: "Validation & Inspection",
    icon: FlaskConical,
    items: [
      { path: "csv-csa",    label: "CSV / CSA",  icon: Monitor },
      { path: "inspection", label: "Inspection", icon: Map },
      { path: "fda-483",    label: "FDA 483",    icon: Building2 },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Cpu,
    items: [
      { path: "agi-console", label: "AGI Console", icon: Bot },
      { path: "governance",  label: "Governance",  icon: BarChart3 },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    icon: SlidersHorizontal,
    items: [
      { path: "settings", label: "Settings", icon: Settings },
    ],
  },
];

function getGroupForPath(pathname: string): string {
  const current = pathname === "/" ? "/" : pathname.slice(1);
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => item.path === current)) return group.id;
  }
  return "qms";
}

export function Sidebar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSite = useActiveSite();
  const { allowedPaths } = useRole();
  const capas = useAppSelector((s) => s.capa.items);
  const openCapaCount = capas.filter((c) => c.status === "Open" || c.status === "In Progress").length;

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set([getGroupForPath(location.pathname)])
  );

  useEffect(() => {
    const active = getGroupForPath(location.pathname);
    setOpenGroups((prev) => {
      if (prev.has(active)) return prev;
      return new Set([...prev, active]);
    });
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => allowedPaths.includes(item.path)),
  })).filter((g) => g.items.length > 0);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside
      aria-label="Application navigation"
      className="w-[260px] min-h-screen flex flex-col shrink-0"
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#f0a500",
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={16} style={{ color: "#ffffff" }} aria-hidden="true" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--sidebar-text)", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
            Pharma Glimmora
          </div>
          <div
            style={{
              color: "var(--sidebar-text-muted)",
              fontSize: 11,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeSite?.name ?? "—"}
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav aria-label="Main navigation" style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleGroups.map((group) => {
            const isOpen = openGroups.has(group.id);
            return (
              <li key={group.id}>
                {/* Group header */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "calc(100% - 16px)",
                    padding: "9px 12px",
                    margin: "2px 8px",
                    borderRadius: 8,
                    background: isOpen ? "var(--sidebar-surface)" : "none",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    color: "var(--sidebar-text)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) (e.currentTarget as HTMLElement).style.background = "none";
                  }}
                >
                  <group.icon size={16} aria-hidden="true" style={{ flexShrink: 0, color: "var(--sidebar-text-muted)" }} />
                  <span style={{ flex: 1, textAlign: "left" }}>{group.label}</span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      color: "var(--sidebar-text-muted)",
                    }}
                  />
                </button>

                {/* Group items */}
                {isOpen && (
                  <ul
                    role="list"
                    style={{
                      listStyle: "none",
                      margin: "2px 0 6px 0",
                      padding: "0 0 0 20px",
                    }}
                  >
                    {group.items.map((item) => (
                      <li key={item.path}>
                        <NavLink
                          to={item.path === "/" ? "/" : `/${item.path}`}
                          end={item.path === "/"}
                          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                          style={{ marginLeft: 0, paddingLeft: 12 }}
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon className="w-4 h-4" aria-hidden="true" />
                              {item.label}
                              {item.path === "capa" && openCapaCount > 0 && (
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: 20,
                                    background: "#dc2626",
                                    color: "#ffffff",
                                    minWidth: 18,
                                    textAlign: "center",
                                  }}
                                >
                                  {openCapaCount}
                                </span>
                              )}
                              {isActive && <span className="sr-only">(current page)</span>}
                            </>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div style={{ padding: "8px 8px 4px" }}>
          <button
            type="button"
            onClick={handleLogout}
            className="nav-item"
            style={{ width: "100%" }}
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Log Out
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 16px 10px",
            fontSize: 10,
            color: "var(--sidebar-text-muted)",
          }}
        >
          <span>© 2025 Glimmora International</span>
          <span>v2.0</span>
        </div>
      </div>
    </aside>
  );
}
