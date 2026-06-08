import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Save } from "lucide-react";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";

// Phase A — New CAPA field set (final, in order):
//   Title* · Description* · Source* · Linked finding (optional) · Risk* ·
//   Site* · Assigned to (driver, optional) · Due date* · DI gate (default off).
// RCA method + Effectiveness toggle removed: method is chosen by the RCA
// assignee on the RCA task; the 90-day effectiveness check is always scheduled
// at closure (not optional, defaults true at the model layer).
const capaSchema = z.object({
  title: z.string().min(1, "Title required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(10, "Description required"),
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"]),
  findingId: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  siteId: z.string().min(1, "Site required"),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date required"),
  diGate: z.boolean(),
});
type CAPAForm = z.infer<typeof capaSchema>;

interface AddCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CAPAForm) => void;
  users: UserConfig[];
  sites: SiteConfig[];  lockedSiteId?: string | null;
  defaultDescription?: string;
  defaultSource?: CAPAForm["source"];
  defaultDiGate?: boolean;
  defaultRisk?: CAPAForm["risk"];
}

export function AddCAPAModal({ isOpen, onClose, onSave, users, sites, lockedSiteId, defaultDescription, defaultSource, defaultDiGate, defaultRisk }: AddCAPAModalProps) {
  const { register: reg, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<CAPAForm>({
    resolver: zodResolver(capaSchema),
    defaultValues: { title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "" },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "", owner: "", dueDate: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSource, defaultRisk, defaultDiGate, defaultDescription, lockedSiteId]);

  function onSubmit(data: CAPAForm) {
    onSave(data);
    reset();
  }

  function handleClose() {
    onClose();
    reset();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="New CAPA">
      <form onSubmit={handleSubmit(onSubmit)} aria-label="Create new CAPA" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Title */}
          <div className="col-span-2">
            <label htmlFor="capa-title" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Title <span className="text-(--danger)">*</span></label>
            <input id="capa-title" type="text" maxLength={120} className="input text-[12px]" placeholder="Short summary (e.g. Filter housing seal qualification interval revision)" {...reg("title")} />
            {errors.title && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.title.message}</p>}
          </div>
          {/* Description */}
          <div className="col-span-2">
            <label htmlFor="capa-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="capa-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the issue..." {...reg("description")} />
            {errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.description.message}</p>}
          </div>
          {/* Source */}
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Source <span className="text-(--danger)">*</span></p><Controller name="source" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "483", label: "FDA 483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />} /></div>
          {/* Linked finding / deviation (optional) */}
          <div><label htmlFor="capa-finding" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Linked finding / deviation (optional)</label><input id="capa-finding" type="text" className="input text-[12px]" placeholder="FIND-001 / DEV-001" {...reg("findingId")} /></div>
          {/* Risk */}
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p><Controller name="risk" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />} /></div>
          {/* Site — hidden for non-admin (auto-assigned from login), visible dropdown for admin */}
          {!lockedSiteId && (
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p><Controller name="siteId" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />} />{errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}</div>
          )}
          {/* Assigned to (driver, optional) — relabelled from "Owner" */}
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Assigned to</p><Controller name="owner" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select driver (optional)" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />{errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}</div>
          {/* Due date */}
          <div><label htmlFor="capa-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label><input id="capa-due" type="date" className="input text-[12px]" {...reg("dueDate")} />{errors.dueDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.dueDate.message}</p>}</div>

          {/* DI gate toggle (default off) */}
          <div className={clsx("col-span-2 flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={control} render={({ field }) => <Toggle id="di-toggle" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Create CAPA</Button>
        </div>
      </form>
    </Modal>
  );
}

export type { CAPAForm };
