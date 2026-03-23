import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface OrgSettings {
  companyName: string;
  timezone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  regulatoryRegion: string;
}

export interface SiteConfig {
  id: string;
  name: string;
  location: string;
  gmpScope: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  status: "Active" | "Inactive";
}

export interface UserConfig {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  status: "Active" | "Inactive";
}

export interface FrameworkSettings {
  p210: boolean;
  p11: boolean;
  annex11: boolean;
  annex15: boolean;
  ichq9: boolean;
  ichq10: boolean;
  gamp5: boolean;
  who: boolean;
  mhra: boolean;
}

export interface AGISettings {
  mode: "autonomous" | "assisted" | "manual";
  confidence: number;
  agents: {
    capa: boolean;
    deviation: boolean;
    fda483: boolean;
    batch: boolean;
    drift: boolean;
    regulatory: boolean;
    supplier: boolean;
  };
}

interface SettingsState {
  org: OrgSettings;
  sites: SiteConfig[];
  users: UserConfig[];
  frameworks: FrameworkSettings;
  agi: AGISettings;
}

const initialState: SettingsState = {
  org: {
    companyName: "",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    regulatoryRegion: "",
  },
  sites: [],
  users: [],
  frameworks: {
    p210: false,
    p11: false,
    annex11: false,
    annex15: false,
    ichq9: false,
    ichq10: false,
    gamp5: false,
    who: false,
    mhra: false,
  },
  agi: {
    mode: "autonomous",
    confidence: 72,
    agents: {
      capa: true,
      deviation: true,
      fda483: true,
      batch: true,
      drift: true,
      regulatory: false,
      supplier: false,
    },
  },
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateOrg(state, { payload }: PayloadAction<Partial<OrgSettings>>) {
      state.org = { ...state.org, ...payload };
    },
    addSite(state, { payload }: PayloadAction<SiteConfig>) {
      if (!state.sites.some((s) => s.id === payload.id)) {
        state.sites.push(payload);
      }
    },
    removeSite(state, { payload }: PayloadAction<string>) {
      state.sites = state.sites.filter((s) => s.id !== payload);
    },
    updateSite(
      state,
      { payload }: PayloadAction<{ id: string; patch: Partial<SiteConfig> }>,
    ) {
      const site = state.sites.find((s) => s.id === payload.id);
      if (site) Object.assign(site, payload.patch);
    },
    addUser(state, { payload }: PayloadAction<UserConfig>) {
      if (!state.users.some((u) => u.id === payload.id)) {
        state.users.push(payload);
      }
    },
    updateUser(
      state,
      { payload }: PayloadAction<{ id: string; patch: Partial<UserConfig> }>,
    ) {
      const user = state.users.find((u) => u.id === payload.id);
      if (user) Object.assign(user, payload.patch);
    },
    toggleFramework(
      state,
      { payload }: PayloadAction<keyof FrameworkSettings>,
    ) {
      state.frameworks[payload] = !state.frameworks[payload];
    },
    updateAGI(
      state,
      { payload }: PayloadAction<Partial<Omit<AGISettings, "agents">>>,
    ) {
      Object.assign(state.agi, payload);
    },
    toggleAgent(
      state,
      { payload }: PayloadAction<keyof AGISettings["agents"]>,
    ) {
      state.agi.agents[payload] = !state.agi.agents[payload];
    },
  },
});

export const {
  updateOrg,
  addSite,
  removeSite,
  updateSite,
  addUser,
  updateUser,
  toggleFramework,
  updateAGI,
  toggleAgent,
} = settingsSlice.actions;
export default settingsSlice.reducer;
