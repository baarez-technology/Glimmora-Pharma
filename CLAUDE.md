# CLAUDE.md — Pharma Glimmora

> Project-wide rules. Every module has its own CLAUDE.md for module-specific details.
> Read this first, then read the relevant module CLAUDE.md before touching any code.

---

## What this project is

Pharma Glimmora is a GxP / GMP inspection-readiness SaaS for pharma and biotech companies.
Regulations: 21 CFR 210/211/11 · EU GMP Annex 11/15 · ICH Q9/Q10 · GAMP 5 · WHO GMP · MHRA

---

## Stack

| Layer        | Package                                               |
| ------------ | ----------------------------------------------------- |
| Framework    | React 19 + TypeScript                                 |
| Build        | Vite                                                  |
| Styling      | Tailwind CSS v4 + `@tailwindcss/vite`                 |
| Routing      | `react-router` v7                                     |
| Global state | `@reduxjs/toolkit` + `react-redux`                    |
| Server state | `@tanstack/react-query` v5                            |
| HTTP         | `axios`                                               |
| Forms        | `react-hook-form` + `@hookform/resolvers` + `zod`     |
| Icons        | `lucide-react` — no other icon library ever           |
| Charts       | `recharts` — no other chart library ever              |
| Date/Time    | `dayjs` + `utc` + `timezone` + `relativeTime` plugins |
| Utilities    | `clsx`                                                |

### Install

```bash
npm create vite@latest pharma-glimmora --template react-ts
cd pharma-glimmora

npm install \
  react-router \
  @reduxjs/toolkit react-redux \
  @tanstack/react-query axios \
  react-hook-form @hookform/resolvers zod \
  dayjs clsx lucide-react recharts \
  tailwindcss @tailwindcss/vite

npm install -D @types/node
```

---

## Project config

### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

### `tsconfig.app.json` — add to `compilerOptions`

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

### `.env`

```
VITE_API_URL=http://localhost:4000/api
```

---

## Folder structure

```
src/
├── main.tsx
├── router/
│   ├── index.tsx              # all routes — lazy + Component only
│   └── loaders.ts             # authLoader, siteLoader
├── store/
│   ├── index.ts
│   ├── auth.slice.ts
│   ├── settings.slice.ts
│   └── theme.slice.ts
├── lib/
│   ├── axios.ts
│   ├── audit.ts
│   ├── dayjs.ts
│   └── chartColors.ts
├── hooks/
│   ├── useAppDispatch.ts
│   ├── useAppSelector.ts
│   └── useRole.ts
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── Toggle.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   └── ThemeToggle.tsx
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   └── auth/
│       ├── LoginPage.tsx
│       └── SitePicker.tsx
└── modules/
    ├── settings/              # has its own CLAUDE.md
    ├── dashboard/
    ├── gap-assessment/
    ├── capa/
    ├── csv-csa/
    ├── inspection/
    ├── fda-483/
    ├── agi-console/
    ├── evidence/
    └── governance/
```

---

## Build order

```
1.  vite.config.ts + tsconfig paths + .env
2.  src/index.css
3.  src/store/ — 3 slices + index.ts
4.  src/hooks/
5.  src/lib/
6.  src/router/
7.  src/main.tsx
8.  src/components/ui/
9.  src/components/layout/
10. src/components/auth/
11. src/modules/settings/        ← must be complete before any module below
12. src/modules/dashboard/
13. src/modules/gap-assessment/
14. src/modules/capa/
15. src/modules/csv-csa/
16. src/modules/inspection/
17. src/modules/fda-483/
18. src/modules/agi-console/
19. src/modules/evidence/
20. src/modules/governance/
```

---

## Routing — lazy + Component always

```tsx
// ✅ CORRECT
{
  path: 'settings',
  lazy: async () => {
    const { SettingsPage } = await import('@/modules/settings/SettingsPage')
    return { Component: SettingsPage }
  },
}

// ❌ WRONG — never element with JSX
{ path: 'settings', element: <SettingsPage /> }
```

### `src/router/loaders.ts`

```ts
import { redirect } from "react-router";
import { store } from "@/store";

export function authLoader() {
  const { token } = store.getState().auth;
  if (!token) return redirect("/login");
  return null;
}

export function siteLoader() {
  const { token, activeSite } = store.getState().auth;
  if (!token) return redirect("/login");
  if (!activeSite) return redirect("/site-picker");
  return null;
}
```

### `src/router/index.tsx`

```tsx
import { createBrowserRouter } from "react-router";
import { authLoader, siteLoader } from "./loaders";

export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => ({
      Component: (await import("@/components/auth/LoginPage")).LoginPage,
    }),
  },
  {
    path: "/site-picker",
    loader: authLoader,
    lazy: async () => ({
      Component: (await import("@/components/auth/SitePicker")).SitePicker,
    }),
  },
  {
    path: "/",
    loader: siteLoader,
    lazy: async () => ({
      Component: (await import("@/components/layout/AppShell")).AppShell,
    }),
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/modules/dashboard/DashboardPage"))
            .DashboardPage,
        }),
      },
      {
        path: "settings",
        lazy: async () => ({
          Component: (await import("@/modules/settings/SettingsPage"))
            .SettingsPage,
        }),
      },
      {
        path: "gap-assessment",
        lazy: async () => ({
          Component: (await import("@/modules/gap-assessment/GapPage")).GapPage,
        }),
      },
      {
        path: "capa",
        lazy: async () => ({
          Component: (await import("@/modules/capa/CAPAPage")).CAPAPage,
        }),
      },
      {
        path: "capa/:id",
        lazy: async () => ({
          Component: (await import("@/modules/capa/CAPADetailPage"))
            .CAPADetailPage,
        }),
      },
      {
        path: "csv-csa",
        lazy: async () => ({
          Component: (await import("@/modules/csv-csa/CSVPage")).CSVPage,
        }),
      },
      {
        path: "inspection",
        lazy: async () => ({
          Component: (await import("@/modules/inspection/InspectionPage"))
            .InspectionPage,
        }),
      },
      {
        path: "fda-483",
        lazy: async () => ({
          Component: (await import("@/modules/fda-483/FDA483Page")).FDA483Page,
        }),
      },
      {
        path: "agi-console",
        lazy: async () => ({
          Component: (await import("@/modules/agi-console/AGIPage")).AGIPage,
        }),
      },
      {
        path: "evidence",
        lazy: async () => ({
          Component: (await import("@/modules/evidence/EvidencePage"))
            .EvidencePage,
        }),
      },
      {
        path: "governance",
        lazy: async () => ({
          Component: (await import("@/modules/governance/GovernancePage"))
            .GovernancePage,
        }),
      },
    ],
  },
]);
```

---

## Redux — 3 slices

### `src/store/auth.slice.ts`

```ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type UserRole =
  | "super_admin"
  | "qa_head"
  | "qc_lab_director"
  | "regulatory_affairs"
  | "csv_val_lead"
  | "it_cdo"
  | "operations_head"
  | "viewer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  gxpSignatory: boolean;
  orgId: string;
}

export interface Site {
  id: string;
  name: string;
  location: string;
  scope: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  activeSite: Site | null;
}

const authSlice = createSlice({
  name: "auth",
  initialState: { token: null, user: null, activeSite: null } as AuthState,
  reducers: {
    setCredentials(
      state,
      { payload }: PayloadAction<{ token: string; user: AuthUser }>,
    ) {
      state.token = payload.token;
      state.user = payload.user;
    },
    setActiveSite(state, { payload }: PayloadAction<Site>) {
      state.activeSite = payload;
    },
    logout(state) {
      state.token = null;
      state.user = null;
      state.activeSite = null;
    },
  },
});

export const { setCredentials, setActiveSite, logout } = authSlice.actions;
export default authSlice.reducer;
```

### `src/store/theme.slice.ts` — reducer is pure, side effects in component

```ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  try {
    return (localStorage.getItem("glimmora-theme") as Theme) ?? "dark";
  } catch {
    return "dark";
  }
}

const themeSlice = createSlice({
  name: "theme",
  initialState: { mode: getInitialTheme() } as { mode: Theme },
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === "dark" ? "light" : "dark";
    },
    setTheme(state, { payload }: PayloadAction<Theme>) {
      state.mode = payload;
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;
export default themeSlice.reducer;
```

> settings.slice — see `src/modules/settings/CLAUDE.md` for the full slice.

### `src/store/index.ts`

```ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./auth.slice";
import settingsReducer from "./settings.slice";
import themeReducer from "./theme.slice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

## Typed hooks

```ts
// src/hooks/useAppDispatch.ts
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";
export const useAppDispatch = () => useDispatch<AppDispatch>();

// src/hooks/useAppSelector.ts
import { useSelector, TypedUseSelectorHook } from "react-redux";
import type { RootState } from "@/store";
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### `src/hooks/useRole.ts`

```ts
import { useAppSelector } from "./useAppSelector";

export function useRole() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "";
  return {
    canSign: user?.gxpSignatory === true,
    canCloseCapa: ["qa_head", "super_admin"].includes(role),
    canApproveDocs: user?.gxpSignatory === true,
    canEditSettings: role === "super_admin",
    canViewAGI: ["it_cdo", "super_admin"].includes(role),
    canView483: ["regulatory_affairs", "qa_head", "super_admin"].includes(role),
    isViewOnly: role === "viewer",
    role,
  };
}
```

---

## Lib files

### `src/lib/axios.ts`

```ts
import axios from "axios";
import { store } from "@/store";
import { logout } from "@/store/auth.slice";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      store.dispatch(logout());
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);
```

### `src/lib/audit.ts`

```ts
import { api } from "./axios";
import { store } from "@/store";

export interface AuditEntry {
  action: string; // 'CAPA_CLOSED' | 'FINDING_CREATED' | 'USER_UPDATED' etc.
  module: string; // 'capa' | 'gap-assessment' | 'settings' etc.
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
  // userId + userEmail + timestamp added server-side — never client
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const { user } = store.getState().auth;
  if (!user) return;
  try {
    await api.post("/audit", {
      ...entry,
      userId: user.id,
      userEmail: user.email,
    });
  } catch {
    console.error("[audit] failed", entry);
  }
}
```

### `src/lib/dayjs.ts`

```ts
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export default dayjs;

// Usage: dayjs.utc(serverTs).tz(orgTimezone).format('DD/MM/YYYY HH:mm')
```

### `src/lib/chartColors.ts`

```ts
export const CHART_COLORS = {
  brand: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#6366f1",
  muted: "#475569",
};

export const chartDefaults = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "var(--chart-grid)" },
  xAxis: {
    tick: { fill: "var(--chart-tick)", fontSize: 11 },
    axisLine: false,
    tickLine: false,
  },
  yAxis: {
    tick: { fill: "var(--chart-tick)", fontSize: 11 },
    axisLine: false,
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      background: "var(--bg-elevated)",
      border: "1px solid var(--bg-border)",
      borderRadius: 8,
      color: "var(--text-primary)",
      fontSize: 12,
    },
  },
};
```

---

## `src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { store } from "@/store";
import { router } from "@/router";
import "./index.css";

// Apply saved theme before first render — prevents flash
const savedTheme = (() => {
  try {
    return localStorage.getItem("glimmora-theme") ?? "dark";
  } catch {
    return "dark";
  }
})();
document.documentElement.setAttribute("data-theme", savedTheme);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
```

---

## Design system — `src/index.css`

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

:root,
[data-theme="dark"] {
  --bg-base: #040e1e;
  --bg-surface: #071526;
  --bg-elevated: #0a1f38;
  --bg-border: #1e3a5a;
  --bg-hover: #0d2a4a;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --brand: #0ea5e9;
  --brand-hover: #0284c7;
  --brand-muted: rgba(14, 165, 233, 0.12);
  --brand-border: rgba(14, 165, 233, 0.3);
  --success: #10b981;
  --success-bg: rgba(16, 185, 129, 0.12);
  --warning: #f59e0b;
  --warning-bg: rgba(245, 158, 11, 0.12);
  --danger: #ef4444;
  --danger-bg: rgba(239, 68, 68, 0.12);
  --info: #6366f1;
  --info-bg: rgba(99, 102, 241, 0.12);
  --card-bg: #0a1f38;
  --card-border: #1e3a5a;
  --card-text: #e2e8f0;
  --card-muted: #64748b;
  --chart-grid: #1e3a5a;
  --chart-tick: #475569;
  --scrollbar-thumb: #1e3a5a;
}

[data-theme="light"] {
  --bg-base: #f0f4f8;
  --bg-surface: #ffffff;
  --bg-elevated: #f8fafc;
  --bg-border: #e2e8f0;
  --bg-hover: #f1f5f9;
  --text-primary: #0a1628;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --brand: #0284c7;
  --brand-hover: #0369a1;
  --brand-muted: rgba(2, 132, 199, 0.08);
  --brand-border: rgba(2, 132, 199, 0.25);
  --success: #059669;
  --success-bg: #f0fdf4;
  --warning: #d97706;
  --warning-bg: #fffbeb;
  --danger: #dc2626;
  --danger-bg: #fef2f2;
  --info: #4f46e5;
  --info-bg: #eef2ff;
  --card-bg: #ffffff;
  --card-border: #e2e8f0;
  --card-text: #0a1628;
  --card-muted: #64748b;
  --chart-grid: #e2e8f0;
  --chart-tick: #94a3b8;
  --scrollbar-thumb: #cbd5e1;
}

* {
  box-sizing: border-box;
}
body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: "Inter", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

@layer components {
  .input {
    @apply w-full rounded-lg px-3 py-2 text-sm outline-none transition-all duration-150;
    background: var(--bg-elevated);
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
  }
  .input::placeholder {
    color: var(--text-muted);
  }
  .input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-muted);
  }
  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select {
    @apply w-full rounded-lg px-3 py-2 text-sm outline-none transition-all duration-150 cursor-pointer appearance-none;
    background-color: var(--bg-elevated);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 32px;
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
  }
  .select:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-muted);
  }
  .select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    @apply inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
           outline-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed;
    background: var(--brand);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  .btn-primary:focus {
    box-shadow: 0 0 0 3px var(--brand-muted);
  }

  .btn-secondary {
    @apply inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
           outline-none transition-all duration-150;
    background: var(--bg-elevated);
    color: var(--text-primary);
    border: 1px solid var(--bg-border);
  }
  .btn-secondary:hover {
    background: var(--bg-hover);
  }

  .btn-ghost {
    @apply inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
           outline-none transition-all duration-150;
    color: var(--text-secondary);
  }
  .btn-ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-danger {
    @apply inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
           outline-none transition-all duration-150;
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid var(--danger);
  }
  .btn-danger:hover {
    background: var(--danger);
    color: white;
  }

  .card {
    @apply rounded-xl overflow-hidden;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
  }
  .card-header {
    @apply flex items-center justify-between px-5 py-4;
    border-bottom: 1px solid var(--card-border);
  }
  .card-title {
    @apply text-sm font-semibold;
    color: var(--card-text);
  }
  .card-body {
    @apply p-5;
  }

  .badge {
    @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold;
  }
  .badge-red {
    background: var(--danger-bg);
    color: var(--danger);
  }
  .badge-amber {
    background: var(--warning-bg);
    color: var(--warning);
  }
  .badge-green {
    background: var(--success-bg);
    color: var(--success);
  }
  .badge-blue {
    background: var(--brand-muted);
    color: var(--brand);
  }
  .badge-gray {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border: 1px solid var(--bg-border);
  }
  .badge-purple {
    background: var(--info-bg);
    color: var(--info);
  }

  .toggle-track {
    @apply relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors duration-200;
    border: 1px solid var(--bg-border);
  }
  .toggle-track.on {
    background: var(--brand);
    border-color: var(--brand);
  }
  .toggle-track.off {
    background: var(--bg-elevated);
  }
  .toggle-thumb {
    @apply absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200;
  }
  .toggle-track.on .toggle-thumb {
    transform: translateX(16px);
  }
  .toggle-track.off .toggle-thumb {
    transform: translateX(2px);
  }

  .data-table {
    @apply w-full border-collapse text-sm;
  }
  .data-table thead tr {
    border-bottom: 1px solid var(--bg-border);
  }
  .data-table th {
    @apply px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider;
    color: var(--text-muted);
  }
  .data-table td {
    @apply px-4 py-3;
    color: var(--card-text);
  }
  .data-table tbody tr {
    border-bottom: 1px solid var(--card-border);
    transition: background 0.1s;
  }
  .data-table tbody tr:hover {
    background: var(--bg-elevated);
  }
  .data-table tbody tr:last-child {
    border-bottom: none;
  }

  /* nav-item — hardcoded dark, sidebar never adapts to light mode */
  .nav-item {
    @apply flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-all duration-150 mx-2;
    color: #94a3b8;
  }
  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
  }
  .nav-item.active {
    background: rgba(14, 165, 233, 0.15);
    color: #0ea5e9;
    border-right: 2px solid #0ea5e9;
    margin-right: 0;
    padding-right: calc(0.75rem + 2px);
  }

  .page-title {
    @apply text-xl font-bold;
    color: var(--text-primary);
  }
  .page-subtitle {
    @apply text-sm mt-0.5;
    color: var(--text-secondary);
  }
  .section-label {
    @apply text-xs font-semibold uppercase tracking-widest px-3 mb-1;
    color: var(--text-muted);
  }

  .agi-panel {
    @apply rounded-xl p-4;
    background: var(--info-bg);
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .alert {
    @apply rounded-lg px-4 py-3 text-sm;
  }
  .alert-info {
    background: var(--brand-muted);
    color: var(--brand);
    border: 1px solid var(--brand-border);
  }
  .alert-success {
    background: var(--success-bg);
    color: var(--success);
  }
  .alert-warning {
    background: var(--warning-bg);
    color: var(--warning);
  }
  .alert-danger {
    background: var(--danger-bg);
    color: var(--danger);
  }

  .stat-card {
    @apply rounded-xl p-5;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
  }
  .stat-label {
    @apply text-xs font-medium mb-2;
    color: var(--text-muted);
  }
  .stat-value {
    @apply text-3xl font-bold;
    color: var(--card-text);
  }
  .stat-sub {
    @apply text-xs mt-1;
    color: var(--text-muted);
  }
}
```

---

## Semantic HTML + ARIA — required on every component

### Rules

- Use the correct HTML element for the job. Never a `<div>` when a semantic element exists.
- Every interactive element must have an accessible label.
- Every region must be identifiable by screen readers.

### Element map

```
Page shell:     <main>, <aside>, <header>, <nav>, <footer>
Page sections:  <section aria-labelledby="...">
Cards/articles: <article> for standalone records (CAPA card, Finding card)
Forms:          <form>, <fieldset>, <legend> for groups, <label htmlFor>
Tables:         <table>, <caption>, <thead>, <tbody>, <th scope="col/row">
Dialogs:        <dialog> or role="dialog" with aria-modal, aria-labelledby
Alerts:         role="alert" for live error/success messages
Status badges:  role="status" for polled/updated values
Lists:          <ul>/<ol> for nav lists, option lists
Buttons:        <button type="button"> never <div onClick>
```

### Required ARIA patterns

```tsx
// ── Page layout ──
<main id="main-content" aria-label="Pharma Glimmora main content">
  <header role="banner">...</header>
  <aside aria-label="Navigation">
    <nav aria-label="Main navigation">...</nav>
  </aside>
  <section aria-labelledby="page-heading">
    <h1 id="page-heading">CAPA Tracker</h1>
  </section>
</main>

// ── Skip link (must be first in DOM) ──
<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>

// ── Forms ──
<form onSubmit={handleSubmit} aria-label="Add new finding">
  <fieldset>
    <legend>Site information</legend>
    <label htmlFor="site-select">Site <span aria-hidden="true">*</span>
      <span className="sr-only">(required)</span>
    </label>
    <select id="site-select" required aria-required="true" aria-describedby="site-hint">...</select>
    <p id="site-hint" className="text-xs">Select the site where the finding occurred</p>
  </fieldset>
</form>

// ── Buttons with icon only ──
<button type="button" aria-label="Delete finding">
  <Trash2 className="w-4 h-4" aria-hidden="true" />
</button>

// ── Toggle ──
<button
  type="button"
  role="switch"
  aria-checked={isOn}
  aria-label="Enable EU GMP Annex 11"
  onClick={handleToggle}
>...</button>

// ── Tables ──
<table aria-label="GxP system inventory">
  <caption className="sr-only">List of computerised systems with compliance status</caption>
  <thead>
    <tr>
      <th scope="col">System</th>
      <th scope="col">Part 11 Status</th>
      <th scope="col" aria-sort="ascending">Risk</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">LIMS (LabWare)</th>
      <td>Non-Compliant</td>
      <td><span className="badge-red" role="status">HIGH</span></td>
    </tr>
  </tbody>
</table>

// ── Dialog / Modal ──
<dialog
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-desc"
>
  <h2 id="modal-title">Close CAPA</h2>
  <p id="modal-desc">This action requires your electronic signature.</p>
</dialog>

// ── Live regions ──
<div role="alert" aria-live="assertive">   {/* errors, warnings */}
  {error && <p>{error}</p>}
</div>
<div role="status" aria-live="polite">     {/* success messages, counts */}
  {saved && <p>Settings saved</p>}
</div>

// ── Loading state ──
<div aria-busy="true" aria-label="Loading CAPA list">
  <Spinner />
</div>

// ── Tabs ──
<div role="tablist" aria-label="Settings sections">
  <button role="tab" aria-selected={activeTab === 'org'} aria-controls="tab-org" id="tab-btn-org">
    Organization
  </button>
</div>
<div role="tabpanel" id="tab-org" aria-labelledby="tab-btn-org" tabIndex={0}>
  ...
</div>

// ── Nav links ──
<nav aria-label="Main navigation">
  <ul role="list">
    <li>
      <NavLink to="/" aria-current={isActive ? 'page' : undefined}>
        <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
        Dashboard
      </NavLink>
    </li>
  </ul>
</nav>

// ── Icons — always hidden from screen readers ──
<AlertCircle className="w-4 h-4" aria-hidden="true" />
```

### Focus management

```tsx
// Modal: focus trap — move focus to dialog on open, return on close
// Skip link: visible on focus, hidden otherwise
// Form errors: focus the first invalid field on submit
// After delete: move focus to next item or parent list

// sr-only utility (add to index.css)
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
}
```

---

## ThemeToggle — side effects in component, not reducer

```tsx
// src/components/ui/ThemeToggle.tsx
import { Sun, Moon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleTheme } from "@/store/theme.slice";

export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);

  const handleToggle = () => {
    dispatch(toggleTheme());
    const next = mode === "dark" ? "light" : "dark";
    localStorage.setItem("glimmora-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={
        mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      aria-pressed={mode === "light"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
        background: "var(--bg-elevated)",
        border: "1px solid var(--bg-border)",
        color: "var(--text-secondary)",
      }}
    >
      {mode === "dark" ? (
        <>
          <Sun size={13} aria-hidden="true" /> Light
        </>
      ) : (
        <>
          <Moon size={13} aria-hidden="true" /> Dark
        </>
      )}
    </button>
  );
}
```

---

## Sidebar — always dark, semantic nav

```tsx
// src/components/layout/Sidebar.tsx
<aside
  aria-label="Application navigation"
  style={{ background: "#071526", borderRight: "1px solid #1e3a5a" }}
>
  <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e3a5a" }}>
    <span style={{ color: "#0ea5e9", fontWeight: 700, fontSize: 15 }}>
      Pharma Glimmora
    </span>
    <p style={{ color: "#3a5070", fontSize: 11, margin: "2px 0 0" }}>
      {activeSite?.name ?? "—"}
    </p>
  </div>
  <nav aria-label="Main navigation">
    <ul role="list" style={{ padding: "8px 0", listStyle: "none", margin: 0 }}>
      {visibleItems.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <item.icon className="w-4 h-4" aria-hidden="true" />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
</aside>
```

### Nav items per role

```
super_admin       → Dashboard, Gap Assessment, CAPA, CSV/CSA, Inspection,
                    Evidence, FDA 483, AGI Console, Governance, Settings
qa_head           → Dashboard, Gap Assessment, CAPA, Evidence, FDA 483, Governance, Settings
qc_lab_director   → Dashboard, Gap Assessment, CAPA, Evidence, Governance
regulatory_affairs → Dashboard, Gap Assessment, CAPA, Evidence, FDA 483, Governance
csv_val_lead      → Dashboard, Gap Assessment, CAPA, CSV/CSA, Inspection, Evidence, Governance
it_cdo            → Dashboard, AGI Console, Settings
operations_head   → Dashboard, Inspection, Governance
viewer            → Dashboard, Governance
```

---

## Settings → Platform dependency map

| Screen                        | Reads from Redux                                     |
| ----------------------------- | ---------------------------------------------------- |
| Topbar                        | `settings.org.companyName`                           |
| Site Picker                   | `settings.sites` (Active only)                       |
| Dashboard heatmap             | `settings.sites` — risk → cell colour                |
| Dashboard AGI panel           | `settings.agi.mode`                                  |
| Gap Assessment tag dropdown   | `settings.frameworks` — ON frameworks only           |
| Gap Assessment owner dropdown | `settings.users` — Active only                       |
| Gap Assessment ICH Q9 score   | `settings.frameworks.ichq9`                          |
| CAPA owner dropdown           | `settings.users` — Active only                       |
| CAPA Sign & Close button      | `auth.user.gxpSignatory`                             |
| CSV/CSA Part 11 column        | `settings.frameworks.p11`                            |
| CSV/CSA Annex 11 column       | `settings.frameworks.annex11`                        |
| CSV/CSA GAMP 5 column         | `settings.frameworks.gamp5`                          |
| CSV/CSA Annex 15 roadmap      | `settings.frameworks.annex15`                        |
| AGI Console agents            | `settings.agi.agents`                                |
| All AGI banners               | `settings.agi.mode` + agent flag                     |
| All PDF exports               | `settings.org.companyName` + `settings.org.timezone` |
| All timestamps                | `settings.org.timezone` (display) — always store UTC |

---

## Compliance rules — never break

1. **Audit trail** — `auditLog()` on every compliance mutation. Never pass a client timestamp.
2. **E-signatures** — on CAPA close, doc approve, 483 submit. Must capture `signerId`, `meaning`, `contentHash`. Timestamp from server.
3. **Immutable records** — no edit/delete UI ever for audit trail, e-signatures, training completions.
4. **Server timestamps** — never `new Date()` or `dayjs()` for compliance records.
5. **AGI output** — always Accept / Reject buttons. Never auto-apply anything.

---

## Icons

```tsx
// lucide-react only — always aria-hidden="true" on decorative icons
<AlertCircle className="w-4 h-4" aria-hidden="true" />   // 16px — inline
<Settings    className="w-5 h-5" aria-hidden="true" />   // 20px — nav, buttons
<Shield      className="w-6 h-6" aria-hidden="true" />   // 24px — hero
```

## Charts

```tsx
// recharts only — always ResponsiveContainer
import { chartDefaults, CHART_COLORS } from "@/lib/chartColors";

<figure aria-label="CAPA closure trend">
  <figcaption className="sr-only">
    Bar chart showing CAPA closures per month
  </figcaption>
  <ResponsiveContainer width="100%" height={240}>
    <BarChart data={data}>
      <CartesianGrid {...chartDefaults.cartesianGrid} />
      <XAxis dataKey="name" {...chartDefaults.xAxis} />
      <YAxis {...chartDefaults.yAxis} />
      <Tooltip {...chartDefaults.tooltip} />
      <Bar dataKey="value" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</figure>;
```

---

## What NOT to do

- Never `element: <JSX />` in routes — always `lazy` + `Component`
- Never raw `useSelector` / `useDispatch` — typed hooks only
- Never side effects inside Redux reducers — reducers are pure
- Never `new Date()` or `dayjs()` for compliance timestamps
- Never auto-apply AGI suggestions
- Never edit/delete audit trail, e-signatures, or training records
- Never show Sign & Close if `gxpSignatory === false`
- Never hardcode site/user/framework lists — always read from Redux
- Never use any icon library other than lucide-react
- Never use any chart library other than recharts
- Never build any module before Settings is complete
- Never hardcode colours — always CSS variables
- Sidebar uses `--sidebar-*` CSS variables — adapts to both light (white) and dark themes
- Never use `<div>` for buttons, nav, tables, forms — use semantic elements
- Never leave interactive elements without an accessible label
