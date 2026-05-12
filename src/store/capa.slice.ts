import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CAPAStatus } from "@/types/capa";

export type CAPARisk = "Critical" | "High" | "Medium" | "Low";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Other";
export type CAPASource = "483" | "Internal Audit" | "Deviation" | "Complaint" | "OOS" | "Change Control" | "Gap Assessment";

export interface CAPA {
  id: string;
  /** Human-readable per-tenant identifier, e.g. "CAPA-2026-014".
   *  Optional in the slice type because legacy in-memory CAPAs created
   *  before the migration may exist transiently; every persisted row
   *  has a non-null reference after the 20260502000000 migration. */
  reference?: string;
  tenantId: string;
  siteId: string;
  findingId?: string;
  source: CAPASource;
  risk: CAPARisk;
  owner: string;
  dueDate: string;
  status: CAPAStatus;
  description: string;
  rca?: string;
  rcaMethod?: RCAMethod;
  correctiveActions?: string;
  effectivenessCheck: boolean;
  effectivenessDate?: string;
  diGate: boolean;
  linkedSystemId?: string;
  linkedSystemName?: string;
  diGateStatus?: "open" | "cleared";
  diGateNotes?: string;
  diGateReviewedBy?: string;
  diGateReviewDate?: string;
  // Substage 4.7 — Action-to-Cause Alignment Review fields. Optional in
  // the Redux shape because legacy in-memory CAPAs created before the
  // migration won't have them; every persisted row populates these (or
  // leaves them null) after migration add_capa_alignment_review.
  alignmentStatus?: "aligned" | "cosmetic" | "needs_review";
  alignmentReviewedBy?: string;
  alignmentReviewedById?: string;
  alignmentReviewedAt?: string;
  alignmentNotes?: string;
  alignmentOverrideBy?: string;
  alignmentOverrideById?: string;
  alignmentOverrideAt?: string;
  alignmentOverrideReason?: string;
  // Substage 6.4 — Linked CC dependency override metadata. Populated only
  // when a Medium/Low CAPA was sealed while linked CCs were still
  // incomplete (the soft-gate path). Null on the normal flow so an
  // inspector can tell at a glance whether an override was applied.
  ccBlockOverrideReason?: string;
  ccBlockOverrideById?: string;
  ccBlockOverrideByName?: string;
  ccBlockOverrideAt?: string;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
}

interface CAPAState {
  items: CAPA[];
}

const initialState: CAPAState = { items: [] };

const capaSlice = createSlice({
  name: "capa",
  initialState,
  reducers: {
    setCAPAs(state, { payload }: PayloadAction<CAPA[]>) {
      state.items = payload;
    },
    addCAPA(state, { payload }: PayloadAction<CAPA>) {
      const idx = state.items.findIndex((c) => c.id === payload.id);
      if (idx >= 0) state.items[idx] = payload;
      else state.items.push(payload);
    },
    updateCAPA(state, { payload }: PayloadAction<{ id: string; patch: Partial<CAPA> }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeCAPA(state, { payload }: PayloadAction<{ id: string; closedBy: string; closedAt: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) {
        item.status = "closed";
        item.closedBy = payload.closedBy;
        item.closedAt = payload.closedAt;
      }
    },
  },
});

export const { setCAPAs, addCAPA, updateCAPA, closeCAPA } = capaSlice.actions;
export default capaSlice.reducer;
