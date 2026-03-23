import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

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

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  activeSiteId: string | null;
}

const authSlice = createSlice({
  name: "auth",
  initialState: { token: null, user: null, activeSiteId: null } as AuthState,
  reducers: {
    setCredentials(
      state,
      { payload }: PayloadAction<{ token: string; user: AuthUser }>,
    ) {
      state.token = payload.token;
      state.user = payload.user;
    },
    setActiveSite(state, { payload }: PayloadAction<string>) {
      state.activeSiteId = payload;
    },
    logout(state) {
      state.token = null;
      state.user = null;
      state.activeSiteId = null;
      try { localStorage.removeItem("glimmora-state"); } catch { /* ignore */ }
    },
  },
});

export const { setCredentials, setActiveSite, logout } = authSlice.actions;
export default authSlice.reducer;
