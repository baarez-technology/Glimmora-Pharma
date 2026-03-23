import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main
            id="main-content"
            aria-label="Pharma Glimmora main content"
            className="flex-1 overflow-y-auto p-5 bg-(--bg-base)"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
