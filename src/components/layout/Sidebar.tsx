import { NavLink, useNavigate } from "react-router";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useActiveSite } from "@/hooks/useActiveSite";
import { logout } from "@/store/auth.slice";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "gap-assessment", label: "Gap Assessment", icon: Search },
  { path: "capa", label: "CAPA Tracker", icon: ClipboardList },
  { path: "csv-csa", label: "CSV / CSA", icon: Monitor },
  { path: "inspection", label: "Inspection", icon: Map },
  { path: "evidence", label: "Evidence", icon: FileText },
  { path: "fda-483", label: "FDA 483", icon: Building2 },
  { path: "agi-console", label: "AGI Console", icon: Bot },
  { path: "governance", label: "Governance", icon: BarChart3 },
  { path: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const activeSite = useActiveSite();
  const { allowedPaths } = useRole();

  const visibleNav = ALL_NAV.filter((item) => allowedPaths.includes(item.path));

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside
      aria-label="Application navigation"
      className="w-60 min-h-screen flex flex-col shrink-0"
      style={{ background: "#071526", borderRight: "1px solid #1e3a5a" }}
    >
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e3a5a" }}>
        <span style={{ color: "#0ea5e9", fontWeight: 700, fontSize: 15 }}>
          Pharma Glimmora
        </span>
        <p style={{ color: "#3a5070", fontSize: 11, margin: "2px 0 0" }}>
          {activeSite?.name ?? "\u2014"}
        </p>
      </div>

      <nav aria-label="Main navigation" style={{ flex: 1, paddingTop: 8 }}>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleNav.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path === "/" ? "/" : `/${item.path}`}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `nav-item${isActive ? " active" : ""}`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="w-4 h-4" aria-hidden="true" />
                    {item.label}
                    {isActive && <span className="sr-only">(current page)</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div style={{ padding: "12px 8px", borderTop: "1px solid #1e3a5a" }}>
        <button
          type="button"
          onClick={handleLogout}
          className="nav-item"
          style={{ width: "100%" }}
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
