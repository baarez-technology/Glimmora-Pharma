import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  module: string;
  action: string;
  recordId: string;
  recordTitle: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  sessionId?: string;
}

export interface AuditFilters {
  module: string;
  action: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

interface AuditTrailState {
  entries: AuditEntry[];
  filters: AuditFilters;
}

const initialState: AuditTrailState = {
  entries: [],
  filters: {
    module: "all",
    action: "all",
    userId: "all",
    dateFrom: "",
    dateTo: "",
  },
};

const auditTrailSlice = createSlice({
  name: "auditTrail",
  initialState,
  reducers: {
    setAuditEntries(state, { payload }: PayloadAction<AuditEntry[]>) {
      state.entries = payload;
    },
    logAction(state, { payload }: PayloadAction<AuditEntry>) {
      state.entries.unshift(payload);
    },
    setAuditFilter(state, { payload }: PayloadAction<Partial<AuditFilters>>) {
      Object.assign(state.filters, payload);
    },
    clearAuditFilters(state) {
      state.filters = { module: "all", action: "all", userId: "all", dateFrom: "", dateTo: "" };
    },
  },
});

export const { setAuditEntries, logAction, setAuditFilter, clearAuditFilters } = auditTrailSlice.actions;
export default auditTrailSlice.reducer;
