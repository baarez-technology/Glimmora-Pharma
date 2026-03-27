import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./auth.slice";
import settingsReducer from "./settings.slice";
import themeReducer from "./theme.slice";
import findingsReducer from "./findings.slice";
import capaReducer from "./capa.slice";
import systemsReducer from "./systems.slice";
import fda483Reducer from "./fda483.slice";
import evidenceReducer from "./evidence.slice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    theme: themeReducer,
    findings: findingsReducer,
    capa: capaReducer,
    systems: systemsReducer,
    fda483: fda483Reducer,
    evidence: evidenceReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
