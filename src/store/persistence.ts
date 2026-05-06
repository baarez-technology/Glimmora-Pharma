import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "glimmora-state";
const VERSION_KEY = "glimmora-version";
const CURRENT_VERSION = "44";

/** Slices to persist. Excludes large/transient slices (auditTrail, notifications) for performance. */
const PERSIST_SLICES = [
  "auth",
  "settings",
  "theme",
  "findings",
  "capa",
  "systems",
  "fda483",
  "evidence",
  "agiDrift",
  "raid",
  "permissions",
  "readiness",
  "deviation",
  "rtm",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPersistedState(): Record<string, any> | undefined {
  // Skip on server-side
  if (typeof window === "undefined") return undefined;

  try {
    const ver = localStorage.getItem(VERSION_KEY);
    if (ver !== CURRENT_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      return undefined;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Auth actions that require immediate persistence (before redirect) */
const IMMEDIATE_ACTIONS = [
  "auth/setCredentials",
  "auth/logout",
  "auth/setActiveSite",
  "auth/setSelectedSite",
  "auth/setCurrentTenant",
];

/** Helper to save state to localStorage */
function saveState(store: { getState: () => Record<string, unknown> }) {
  try {
    const state = store.getState();
    const toPersist: Record<string, unknown> = {};
    for (const key of PERSIST_SLICES) {
      toPersist[key] = state[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

/** Debounced save — avoids thrashing localStorage on rapid dispatch bursts. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const persistMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);

  // Skip on server-side
  if (typeof window === "undefined") return result;

  // Get action type safely
  const actionType = typeof action === "object" && action !== null && "type" in action
    ? (action as { type: string }).type
    : "";

  // Save immediately for critical auth actions (before page redirects)
  if (IMMEDIATE_ACTIONS.includes(actionType)) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    saveState(store);
    return result;
  }

  // Debounced save for other actions
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(store), 500);

  return result;
};
