import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type RAIDType = "Risk" | "Action" | "Issue" | "Decision";
export type RAIDStatus = "Open" | "In Progress" | "Closed" | "Escalated";
export type RAIDPriority = "Critical" | "High" | "Medium" | "Low";

export interface RAIDItem {
  id: string;
  tenantId: string;
  siteId: string;
  type: RAIDType;
  title: string;
  description: string;
  priority: RAIDPriority;
  status: RAIDStatus;
  owner: string;
  dueDate: string;
  impact?: string;
  mitigation?: string;
  resolution?: string;
  raisedBy: string;
  createdAt: string;
  closedAt?: string;
  reopenedBy?: string;
  reopenedDate?: string;
  reopenReason?: string;
}

interface RAIDState {
  items: RAIDItem[];
  loading: boolean;
  error: string | null;
}

const initialState: RAIDState = { items: [], loading: false, error: null };

const raidSlice = createSlice({
  name: "raid",
  initialState,
  reducers: {
    setRAIDItems(state, { payload }: PayloadAction<RAIDItem[]>) {
      state.items = payload;
      state.loading = false;
      state.error = null;
    },
    setRAIDLoading(state, { payload }: PayloadAction<boolean>) {
      state.loading = payload;
    },
    setRAIDError(state, { payload }: PayloadAction<string | null>) {
      state.error = payload;
      state.loading = false;
    },
    addItem(state, { payload }: PayloadAction<RAIDItem>) {
      state.items.push(payload);
    },
    updateItem(state, { payload }: PayloadAction<{ id: string; patch: Partial<RAIDItem> }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeItem(state, { payload }: PayloadAction<{ id: string; resolution: string }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) {
        item.status = "Closed";
        item.resolution = payload.resolution;
        item.closedAt = "";
      }
    },
    removeItem(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((r) => r.id !== payload);
    },
    reopenItem(state, { payload }: PayloadAction<{ id: string; reopenedBy: string; reason: string }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) {
        item.status = "Open";
        item.reopenedBy = payload.reopenedBy;
        item.reopenedDate = new Date().toISOString();
        item.reopenReason = payload.reason;
        item.closedAt = undefined;
      }
    },
  },
});

export const { setRAIDItems, setRAIDLoading, setRAIDError, addItem, updateItem, closeItem, removeItem, reopenItem } = raidSlice.actions;
export default raidSlice.reducer;
