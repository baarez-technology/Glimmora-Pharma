import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "./index";

const STORAGE_KEY = "glimmora-state";

export function loadPersistedState(): Partial<RootState> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<RootState>;
  } catch {
    return undefined;
  }
}

export const persistMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  try {
    const state = store.getState() as RootState;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        auth: state.auth,
        settings: state.settings,
      }),
    );
  } catch {
    // quota exceeded or private browsing — ignore
  }
  return result;
};
