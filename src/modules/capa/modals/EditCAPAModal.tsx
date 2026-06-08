import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Lock, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";

const editSchema = z.object({
  // Phase A — short title (mirrors the create field set).
  title: z.string().min(1, "Title required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(5, "Description required"),
  owner: z.string().min(1, "Assigned-to is required"),
  dueDate: z.string().min(1, "Due date required"),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
  rca: z.string().optional(),
  // SME Section 1, Stage 4 (FULL) — corrective actions are now managed
  // via the structured Action Items table in the Actions tab. The
  // textarea was removed from this modal; updateCAPA rejects any
  // correctiveActions payload it receives. Field omitted from the
  // form schema so consumers can't accidentally resurrect the old
  // edit surface.
  // Phase A — effectivenessCheck toggle removed (always scheduled at closure).
  diGate: z.boolean(),
  diGateStatus: z.enum(["open", "cleared"]).optional(),
  diGateNotes: z.string().optional(),
  diGateReviewedBy: z.string().optional(),
  diGateReviewDate: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

interface EditCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditForm) => void;
  capa: CAPA | null;
  users: UserConfig[];}

export function EditCAPAModal({ isOpen, onClose, onSave, capa, users }: EditCAPAModalProps) {
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (capa) {
      form.reset({
        title: capa.title,
        description: capa.description,
        owner: capa.owner,
        dueDate: dayjs.utc(capa.dueDate).format("YYYY-MM-DD"),
        risk: capa.risk,
        rcaMethod: capa.rcaMethod ?? undefined,
        rca: capa.rca ?? "",
        diGate: capa.diGate,
        diGateStatus: capa.diGateStatus ?? "open",
        diGateNotes: capa.diGateNotes ?? "",
        diGateReviewedBy: capa.diGateReviewedBy ?? "",
        diGateReviewDate: capa.diGateReviewDate ?? "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capa?.id]);

  if (!capa) return null;

  // SME Section 1, Stage 3 (partial) — RCA field-lock (client mirror).
  // Server enforces the same rule in updateCAPA. When locked we still
  // render the values (informational during review) but disable inputs
  // and strip rca/rcaMethod from the submitted payload so the server's
  // lock check sees no edit intent. JSON.stringify drops undefined
  // values, so setting these to undefined removes them from the wire.
  const rcaLocked = LOCKED_CAPA_STATUSES.has(capa.status);
  const handleSave = (data: EditForm) => {
    if (rcaLocked) {
      onSave({ ...data, rca: undefined, rcaMethod: undefined });
    } else {
      onSave(data);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={`Edit ${capa.reference ?? "CAPA"}`} className="max-w-2xl">
      <form onSubmit={form.handleSubmit(handleSave)} aria-label="Edit CAPA" noValidate className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Basic information</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="edit-title" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Title <span className="text-(--danger)">*</span></label>
            <input id="edit-title" type="text" maxLength={120} className="input text-[12px]" {...form.register("title")} />
            {form.formState.errors.title && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.title.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="edit-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="edit-desc" rows={2} className="input text-[12px] resize-none" {...form.register("description")} />
            {form.formState.errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.description.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p>
            <Controller name="risk" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Assigned to <span className="text-(--danger)">*</span></p>
            <Controller name="owner" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select driver" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />
            {form.formState.errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.owner.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label>
            <input id="edit-due" type="date" className="input text-[12px]" {...form.register("dueDate")} />
          </div>
          <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={form.control} render={({ field }) => <Toggle id="edit-di" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>
        </div>

        {/* DI Gate review section — only visible when diGate is true */}
        {form.watch("diGate") && (
          <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>DI Gate — Data Integrity Review</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">DI Gate Status <span className="text-(--danger)">*</span></p>
                <Controller name="diGateStatus" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? "open"} onChange={field.onChange} width="w-full" options={[{ value: "open", label: "Open — review not done" }, { value: "cleared", label: "Cleared — DI review complete" }]} />
                )} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Reviewed by</p>
                <Controller name="diGateReviewedBy" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select reviewer..." width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
                )} />
              </div>
              <div>
                <label htmlFor="edit-di-date" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Review date</label>
                <input id="edit-di-date" type="date" className="input text-[12px]" {...form.register("diGateReviewDate")} />
              </div>
              <div className="col-span-2">
                <label htmlFor="edit-di-notes" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">DI review notes</label>
                <textarea id="edit-di-notes" rows={3} className="input text-[12px] resize-none" placeholder="e.g. Audit trail verified in all 12 LIMS modules..." {...form.register("diGateNotes")} />
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Root cause analysis</p>
          {rcaLocked && (
            <p className="text-[11px] mb-3 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Lock className="w-3 h-3" aria-hidden="true" />
              Root cause analysis is locked once the CAPA enters QA review. Reopen to edit.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5 flex items-center gap-1">
                RCA method
                {rcaLocked && <Lock className="w-3 h-3" aria-hidden="true" />}
              </p>
              <Controller name="rcaMethod" control={form.control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" disabled={rcaLocked} options={[{ value: "5 Why", label: "5 Why" }, { value: "Fishbone", label: "Fishbone" }, { value: "Fault Tree", label: "Fault Tree" }, { value: "Other", label: "Other" }]} />} />
            </div>
            <div className="col-span-2">
              <label htmlFor="edit-rca" className="text-[11px] font-medium text-(--text-secondary) mb-1.5 flex items-center gap-1">
                Root cause
                <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(required before submitting for QA review)</span>
                {rcaLocked && <Lock className="w-3 h-3 ml-1" aria-hidden="true" />}
              </label>
              <textarea
                id="edit-rca"
                rows={4}
                className="input text-[12px] resize-none"
                placeholder="Describe the root cause..."
                disabled={rcaLocked}
                title={rcaLocked ? "Locked during QA review" : undefined}
                {...form.register("rca")}
              />
            </div>
            {/* SME Section 1, Stage 4 (FULL) — corrective-actions
                textarea removed. The Action Plan table in the Actions
                tab is the only edit surface now. */}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={form.formState.isSubmitting}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

export type { EditForm };
