"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Users,
  MapPin,
  Search,
  X,
  Save,
  Upload,
  FileText,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  addTenant,
  updateTenant,
  removeTenant,
  setTenants,
  type Tenant,
} from "@/store/auth.slice";
import { fetchTenants, createTenantApi, updateTenantApi, deleteTenantApi } from "@/lib/tenantApi";
import { toggleTenantMFA } from "@/actions/tenants";
import { aiSignup, generateCustomerId, AiAuthError } from "@/lib/aiAuth";
import { friendlyAiError } from "@/lib/friendlyError";
import { isTenantEffectivelyActive, getInactiveReason } from "@/lib/tenantStatus";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { evaluatePasswordStrength, generateStrongPassword } from "@/lib/passwords";
import dayjs from "@/lib/dayjs";

/* ── Helpers ── */

/* ── Yes / No toggle button ── */

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex gap-0 rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-3 py-1.5 text-[11px] font-semibold border-none cursor-pointer transition-all"
          style={{
            background: value ? "var(--brand)" : "var(--bg-surface)",
            color: value ? "#fff" : "var(--text-muted)",
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-3 py-1.5 text-[11px] font-semibold border-none cursor-pointer transition-all"
          style={{
            background: !value ? "var(--danger)" : "var(--bg-surface)",
            color: !value ? "#fff" : "var(--text-muted)",
            borderLeft: "1px solid var(--bg-border)",
          }}
        >
          No
        </button>
      </div>
    </div>
  );
}

/* ── Subscription Plan types & modal ── */

interface SubPlan {
  id: string;
  startDate: string;
  expiryDate: string;
  maxAccounts: number;
  status: "Active" | "Inactive";
}

export function SubscriptionPlansModal({
  open,
  onClose,
  plans,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubPlan[];
  onSave: (plans: SubPlan[]) => void;
}) {
  const [items, setItems] = useState<SubPlan[]>(plans);
  const [editModal, setEditModal] = useState<SubPlan | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Sync local items with props only when modal opens, not on every render
  useEffect(() => {
    if (open) setItems(plans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});

  const openNew = () => {
    setEditModal({
      id: `sp-${Date.now()}`,
      startDate: "",
      expiryDate: "",
      maxAccounts: 0,
      status: "Active",
    });
    setIsNew(true);
    setPlanErrors({});
  };

  const openEdit = (p: SubPlan) => {
    setEditModal({ ...p });
    setIsNew(false);
    setPlanErrors({});
  };

  const handleDelete = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    onSave(next);
  };

  const validatePlan = (): boolean => {
    if (!editModal) return false;
    const e: Record<string, string> = {};
    if (!editModal.startDate) e.startDate = "Start date is required";
    if (!editModal.expiryDate) e.expiryDate = "Expiry date is required";
    if (editModal.startDate && editModal.expiryDate && editModal.expiryDate <= editModal.startDate) {
      e.expiryDate = "Expiry must be after start date";
    }
    if (editModal.maxAccounts < 1) e.maxAccounts = "Must be at least 1";
    setPlanErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSavePlan = () => {
    if (!editModal || !validatePlan()) return;
    let next: SubPlan[];
    if (isNew) {
      next = [...items, editModal];
    } else {
      next = items.map((i) => (i.id === editModal.id ? editModal : i));
    }
    setItems(next);
    onSave(next);
    setEditModal(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Subscription Plans">
      {/* Plans table */}
      <div className="card mb-4">
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Subscription plans">
            <thead>
              <tr>
                <th scope="col">Accounts Available</th>
                <th scope="col">Expiry Date</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>No Subscription Plans Found</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Add a subscription plan to get started.</p>
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.maxAccounts}</td>
                    <td>{p.expiryDate || "—"}</td>
                    <td>
                      <Badge variant={p.status === "Active" ? "green" : "gray"}>{p.status}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="p-1 rounded border-none cursor-pointer bg-transparent"
                          style={{ color: "var(--text-secondary)" }}
                          aria-label="Edit plan"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1 rounded border-none cursor-pointer bg-transparent"
                          style={{ color: "var(--danger)" }}
                          aria-label="Delete plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>New Subscription Plan</Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>

      {/* New / Edit subscription modal */}
      {editModal && (
        <Modal open onClose={() => setEditModal(null)} title={isNew ? "New Subscription" : "Edit Subscription"}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Start date <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={editModal.startDate}
                  onChange={(e) => setEditModal({ ...editModal, startDate: e.target.value })}
                  className="input"
                  style={planErrors.startDate ? { borderColor: "var(--danger)" } : undefined}
                />
                {planErrors.startDate && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.startDate}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Expiry date <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={editModal.expiryDate}
                  onChange={(e) => setEditModal({ ...editModal, expiryDate: e.target.value })}
                  className="input"
                  style={planErrors.expiryDate ? { borderColor: "var(--danger)" } : undefined}
                />
                {planErrors.expiryDate && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.expiryDate}</p>}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Max accounts <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                value={editModal.maxAccounts}
                onChange={(e) => setEditModal({ ...editModal, maxAccounts: Number(e.target.value) })}
                className="input"
                style={planErrors.maxAccounts ? { borderColor: "var(--danger)" } : undefined}
              />
              {planErrors.maxAccounts && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.maxAccounts}</p>}
            </div>
            <div>
              <span className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Status</span>
              <div className="flex gap-0 rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)", display: "inline-flex" }}>
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, status: "Active" })}
                  className="px-4 py-1.5 text-[12px] font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: editModal.status === "Active" ? "var(--brand)" : "var(--bg-surface)",
                    color: editModal.status === "Active" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, status: "Inactive" })}
                  className="px-4 py-1.5 text-[12px] font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: editModal.status === "Inactive" ? "var(--danger)" : "var(--bg-surface)",
                    color: editModal.status === "Inactive" ? "#fff" : "var(--text-muted)",
                    borderLeft: "1px solid var(--bg-border)",
                  }}
                >
                  Inactive
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="primary" size="sm" icon={Save} onClick={handleSavePlan}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditModal(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* ── Account form data ── */

interface AccountFormData {
  // Customer code is no longer in the form — the API derives it server-side
  // from the tenant id (pages/api/tenants.ts:76 sets customerCode: body.id).
  // User role is always "customer_admin" for this modal — hardcoded in the
  // parent's create handler payload, not collected here.
  customerName: string;
  username: string;
  email: string;
  language: string;
  timezone: string;
  active: boolean;
  mfaEnabled: boolean;
  newPassword: string;
  confirmPassword: string;
  subscriptionPlans: SubPlan[];
  logoFile: File | null;
}

function makeEmptyForm(): AccountFormData {
  return {
    customerName: "",
    username: "",
    email: "",
    language: "English, United States",
    timezone: "Asia/Kolkata",
    active: true,
    mfaEnabled: false,
    newPassword: "",
    confirmPassword: "",
    subscriptionPlans: [],
    logoFile: null,
  };
}

/* ── Account Drawer (replaces nested modals) ── */

function AccountDrawer({
  open,
  onClose,
  onSave,
  initial,
  mode,
  isSuperAdmin = false,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: AccountFormData) => void;
  initial: AccountFormData;
  mode: "create" | "edit";
  /** Tenant-level MFA toggle is super_admin only — customer_admin must not
   *  control MFA on their own tenant. When false, the toggle JSX + help text
   *  are hidden and the parent's save handler skips the toggleTenantMFA call. */
  isSuperAdmin?: boolean;
}) {
  const [form, setForm] = useState<AccountFormData>(initial);
  // Per-field "user has interacted" map. A field's error is only surfaced
  // after the user has blurred it or attempted submit — pristine fields stay
  // silent so a fresh modal isn't a wall of red.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Flips true the first time the user clicks Save. After that, every error
  // is visible regardless of touched state — covers the "user never tabbed,
  // just clicked Save" path.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subSnapshot, setSubSnapshot] = useState<SubPlan[] | null>(null);
  // Drag-drop overlay: only shown when the user is actively dragging a file
  // over the modal. Keeps the body uncluttered in the common no-drag state.
  const [isDragging, setIsDragging] = useState(false);
  // Password UX state — show/hide eyes + a 3s toast after generate.
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwToast, setPwToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setTouched({});
      setSubmitAttempted(false);
      setSubModalOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Errors are derived from form + mode on every render — no setErrors. This
  // lets the inline error text disappear the instant the user fixes a field,
  // without waiting for another submit click to refresh state.
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!form.customerName.trim()) e.customerName = "Required";

    if (!form.username.trim()) e.username = "Required";
    else if (!/^[a-z0-9_]+$/.test(form.username.trim())) e.username = "Lowercase letters, digits, and underscores only";

    if (!form.email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";

    if (mode === "create") {
      // No length floor — single-character demo passwords are accepted. The
      // 4-segment strength meter below the field still renders so the user
      // sees how strong their password is, and the Generate button still
      // produces a 16-char strong one. Submission is not blocked on weakness.
      if (!form.newPassword) e.newPassword = "Required";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    } else if (form.newPassword && form.newPassword !== form.confirmPassword) {
      e.confirmPassword = "Passwords don't match";
    }
    return e;
  }, [form, mode]);

  // A field-level error is "visible" once the user has interacted with that
  // field OR clicked Save. Pristine fields stay silent.
  const errorVisible = (name: string) => (touched[name] || submitAttempted) && !!errors[name];

  const handleSubmit = () => {
    if (Object.keys(errors).length === 0) {
      onSave(form);
      onClose();
    }
  };

  // Computed once per render — feeds the strength meter and gates the Save
  // button. Kept colocated with canSave so they stay in lockstep.
  const passwordStrength = evaluatePasswordStrength(form.newPassword);

  // Live form-validity check for the Save button's disabled state. Mirrors
  // validate() but is pure (no setErrors side effect) so it runs every render.
  const canSave =
    form.customerName.trim().length >= 2 &&
    form.username.trim().length >= 3 &&
    /^[a-z0-9_]+$/.test(form.username.trim()) &&
    form.email.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    (mode === "edit" || (
      form.newPassword.length >= 6 &&
      form.newPassword === form.confirmPassword
    ));

  const handleGeneratePassword = async () => {
    const pwd = generateStrongPassword(16);
    setForm((prev) => ({ ...prev, newPassword: pwd, confirmPassword: pwd }));
    setShowNewPassword(true);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(pwd);
        setPwToast("Password generated and copied to clipboard.");
      } else {
        setPwToast("Password generated. Copy it from the field below.");
      }
    } catch {
      setPwToast("Password generated (clipboard copy failed — please copy manually).");
    }
    setTimeout(() => setPwToast(null), 3000);
  };

  // Drop handler is on the modal root (via onDrop) — no separate helper needed.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => set("logoFile", e.target.files?.[0] ?? null);

  // Subscription helpers
  const activeSub = form.subscriptionPlans[0] ?? null;
  const updateSub = (patch: Partial<SubPlan>) => {
    if (activeSub) {
      set("subscriptionPlans", form.subscriptionPlans.map((p) => p.id === activeSub.id ? { ...p, ...patch } : p));
    }
  };
  const addSub = () => {
    set("subscriptionPlans", [{ id: `sp-${Date.now()}`, startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" }]);
  };

  const LABEL = "block text-[11px] font-medium mb-1" as const;

  if (!open) return null;

  const openSubModal = () => {
    setSubSnapshot(JSON.parse(JSON.stringify(form.subscriptionPlans)));
    setSubModalOpen(true);
  };
  const cancelSubModal = () => {
    if (subSnapshot) set("subscriptionPlans", subSnapshot);
    setSubSnapshot(null);
    setSubModalOpen(false);
  };
  const saveSubModal = () => {
    setSubSnapshot(null);
    setSubModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "create" ? "New Account" : "Edit Account"}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      {/* Modal */}
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl shadow-2xl mx-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          // Only clear when leaving the modal entirely — not when entering a child.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && (f.type === "image/png" || f.type === "image/jpeg")) set("logoFile", f);
        }}
      >
        {/* Drop overlay — visible only during active drag */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none" style={{ background: "var(--brand-muted)", border: "2px dashed var(--brand)" }}>
            <div className="text-center">
              <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <p className="text-[13px] font-semibold" style={{ color: "var(--brand)" }}>Drop logo here</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>PNG or JPG, max 5MB</p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 rounded-t-xl" style={{ borderBottom: "1px solid var(--bg-border)" }}>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>{mode === "create" ? "Add Customer Account" : "Edit Account"}</h2>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {mode === "create" ? "Create a new tenant and its Customer Administrator account." : form.customerName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md border-none cursor-pointer bg-transparent" style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── ACCOUNT INFO ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Account Information</h3>
            <div className="mb-3">
              <label htmlFor="acct-customer-name" className={LABEL} style={{ color: "var(--text-secondary)" }}>
                Customer Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="acct-customer-name"
                type="text"
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                onBlur={() => markTouched("customerName")}
                placeholder="e.g. Acme Pharma Ltd."
                aria-invalid={errorVisible("customerName")}
                aria-describedby={errorVisible("customerName") ? "customerName-error" : undefined}
                className={`input ${errorVisible("customerName") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {errorVisible("customerName") && (
                <p id="customerName-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.customerName}</p>
              )}
            </div>
            <div className="mb-3">
              <label htmlFor="acct-username" className={LABEL} style={{ color: "var(--text-secondary)" }}>
                Username <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="acct-username"
                type="text"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                onBlur={() => markTouched("username")}
                placeholder="e.g. acme_admin"
                aria-invalid={errorVisible("username")}
                aria-describedby={errorVisible("username") ? "username-error" : undefined}
                className={`input ${errorVisible("username") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {errorVisible("username") && (
                <p id="username-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.username}</p>
              )}
            </div>
            <div className="mb-3">
              <label htmlFor="acct-email" className={LABEL} style={{ color: "var(--text-secondary)" }}>
                Email <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="acct-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => markTouched("email")}
                placeholder="admin@company.com"
                aria-invalid={errorVisible("email")}
                aria-describedby={errorVisible("email") ? "email-error" : undefined}
                className={`input ${errorVisible("email") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {errorVisible("email") && (
                <p id="email-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.email}</p>
              )}
            </div>
            {/* Compact logo upload — full drop-zone overlay is on the modal root. */}
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Logo <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
              {form.logoFile ? (
                <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                  <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
                    <FileText className="w-5 h-5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate" style={{ color: "var(--text-primary)" }}>{form.logoFile.name}</p>
                    <div className="flex gap-3 mt-0.5">
                      <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] font-medium border-none bg-transparent cursor-pointer p-0" style={{ color: "var(--brand)" }}>Replace</button>
                      <button type="button" onClick={() => set("logoFile", null)} className="text-[11px] font-medium border-none bg-transparent cursor-pointer p-0" style={{ color: "var(--danger)" }}>Remove</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)", color: "var(--text-primary)" }}>
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Upload logo
                  </button>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>PNG or JPG, max 5MB</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileSelect} />
            </div>
          </div>

          {/* ── SETTINGS ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Settings</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Language</label><select value={form.language} onChange={(e) => set("language", e.target.value)} className="select"><option>English, United States</option><option>English, United Kingdom</option><option>Hindi</option><option>Arabic</option></select></div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Time Zone</label><select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className="select"><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Qatar">Asia/Qatar</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option><option value="Asia/Dubai">Asia/Dubai</option></select></div>
            </div>
            {/* Active toggle: only in edit mode. Create defaults to active=true (set in makeEmptyForm); deactivation is a separate row-level action. */}
            {mode === "edit" && (
              <div className="mb-3">
                <Toggle id="toggle-active" label="Active" checked={form.active} onChange={(v) => set("active", v)} />
              </div>
            )}
            {isSuperAdmin && (
              <div>
                <Toggle id="toggle-mfa" label="Require MFA" checked={form.mfaEnabled} onChange={(v) => set("mfaEnabled", v)} />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  User receives an email verification code on every login. Enabling on an existing tenant signs out all active sessions.
                </p>
              </div>
            )}
          </div>

          {/* ── PASSWORD ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Password</h3>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="inline-flex items-center gap-1 text-[11px] font-semibold border-none bg-transparent cursor-pointer"
                style={{ color: "var(--brand)" }}
                aria-label="Generate strong password"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                Generate
              </button>
            </div>
            {mode === "edit" && <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>Leave blank to keep current password</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pw-new" className={LABEL} style={{ color: "var(--text-secondary)" }}>
                  New Password{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}
                </label>
                <div className="relative">
                  <input
                    id="pw-new"
                    type={showNewPassword ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(e) => set("newPassword", e.target.value)}
                    onBlur={() => markTouched("newPassword")}
                    placeholder={mode === "edit" ? "••••••••" : "Enter password"}
                    className={`input ${errorVisible("newPassword") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
                    style={{ paddingRight: 36 }}
                    aria-invalid={errorVisible("newPassword")}
                    aria-describedby={errorVisible("newPassword") ? "pw-new-error" : (form.newPassword ? "pw-new-strength" : undefined)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 right-2 border-none bg-transparent cursor-pointer p-1 flex items-center"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    aria-pressed={showNewPassword}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {form.newPassword.length > 0 && (() => {
                  // 4-segment strength bar. Colour ramps from danger -> success;
                  // label gives screen-reader-friendly context (the bar alone is
                  // colour-only, so the label is the accessible cue).
                  const segColor =
                    passwordStrength <= 1 ? "var(--danger)" :
                    passwordStrength === 2 ? "var(--warning)" :
                    passwordStrength === 3 ? "#eab308" :
                    "var(--success)";
                  const segLabel =
                    passwordStrength <= 1 ? "Very weak" :
                    passwordStrength === 2 ? "Weak" :
                    passwordStrength === 3 ? "Good" :
                    "Strong";
                  return (
                    <div id="pw-new-strength" className="mt-1.5" role="status" aria-live="polite">
                      <div className="flex gap-1" aria-hidden="true">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-1 flex-1 rounded-full transition-colors"
                            style={{ background: i <= passwordStrength ? segColor : "var(--bg-elevated)" }}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: segColor }}>
                        Strength: {segLabel}
                      </p>
                    </div>
                  );
                })()}
                {errorVisible("newPassword") && <p id="pw-new-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.newPassword}</p>}
              </div>
              <div>
                <label htmlFor="pw-confirm" className={LABEL} style={{ color: "var(--text-secondary)" }}>
                  Confirm{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}
                </label>
                <div className="relative">
                  <input
                    id="pw-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    onBlur={() => markTouched("confirmPassword")}
                    placeholder={mode === "edit" ? "••••••••" : "Confirm"}
                    className={`input ${errorVisible("confirmPassword") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
                    style={{ paddingRight: 36 }}
                    aria-invalid={errorVisible("confirmPassword")}
                    aria-describedby={errorVisible("confirmPassword") ? "pw-confirm-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 right-2 border-none bg-transparent cursor-pointer p-1 flex items-center"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {errorVisible("confirmPassword") && <p id="pw-confirm-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>

          {/* ── SUBSCRIPTION (summary + modal trigger) ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Subscription</h3>
            {activeSub ? (
              <div className="rounded-lg p-3 flex items-start justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: activeSub.status === "Active" ? "var(--success-bg)" : "var(--danger-bg)", color: activeSub.status === "Active" ? "var(--success)" : "var(--danger)" }}>{activeSub.status}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>&middot; {activeSub.maxAccounts === -1 ? "Unlimited" : activeSub.maxAccounts} accounts</span>
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Expires {activeSub.expiryDate ? dayjs(activeSub.expiryDate).format("MMM D, YYYY") : "\u2014"}</p>
                </div>
                <button type="button" onClick={openSubModal} className="text-[11px] font-medium border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--brand)" }}>Edit Subscription</button>
              </div>
            ) : (
              // Neutral card — "no subscription" is the default state for a fresh tenant,
              // not a warning. Warning amber reserved for actual expiry/inactive cases.
              <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No active subscription</span>
                <button type="button" onClick={() => { addSub(); openSubModal(); }} className="text-[11px] font-semibold border-none bg-transparent cursor-pointer" style={{ color: "var(--brand)" }}>+ Add Subscription</button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {(() => {
          // Compute once for both the hint strip and the Save button title.
          const labels: Record<string, string> = {
            customerName: "Customer Name",
            username: "Username",
            email: "Email",
            newPassword: "Password",
            confirmPassword: "Confirm Password",
          };
          const blockingFields = Object.keys(errors).filter((k) => labels[k]).map((k) => labels[k]);
          const showHint = blockingFields.length > 0 && (Object.values(touched).some(Boolean) || submitAttempted);
          return (
            <div className="shrink-0 rounded-b-xl" style={{ borderTop: "1px solid var(--bg-border)" }}>
              {/* "Fill this" hint slot — ALWAYS rendered. visibility toggles
                  on showHint so the strip doesn't shift the rest of the modal
                  the first time the user blurs a field (which would otherwise
                  move the next input under the user's mouse mid-click and
                  break field-to-field navigation). Amber, not red: red is
                  for the field-level error text below each input. */}
              <div className="px-6 pt-3" aria-hidden={!showHint}>
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-lg border border-[#f59e0b]/40 bg-[#fef9ed] px-3 py-2"
                  style={{ visibility: showHint ? "visible" : "hidden" }}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b45309]" aria-hidden="true" />
                  <div className="text-xs text-[#7a5320]">
                    <span className="font-semibold">Please complete:</span>{" "}
                    {showHint ? blockingFields.join(", ") : " "}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4">
                <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                {/* Save button stays clickable even when invalid — the click
                    trips submitAttempted so the hint strip + inline errors
                    surface immediately. opacity-50 is the visual cue that it
                    won't submit yet; the title gives a hover explanation. */}
                <span title={!canSave ? `Complete: ${blockingFields.join(", ")}` : undefined}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    onClick={() => {
                      setSubmitAttempted(true);
                      if (Object.keys(errors).length === 0) {
                        handleSubmit();
                      }
                    }}
                    className={canSave ? "" : "opacity-50 cursor-not-allowed"}
                  >
                    {mode === "create" ? "Save Account" : "Save Changes"}
                  </Button>
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Subscription modal (Cancel reverts changes) ── */}
      {subModalOpen && activeSub && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Subscription Plan">
          <div className="absolute inset-0 bg-black/50" onClick={cancelSubModal} aria-hidden="true" />
          <div className="relative w-full max-w-[420px] rounded-xl shadow-2xl mx-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--bg-border)" }}>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Subscription Plan</h3>
              <button type="button" onClick={cancelSubModal} aria-label="Close" className="p-1 rounded border-none cursor-pointer bg-transparent" style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Start date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.startDate} onChange={(e) => updateSub({ startDate: e.target.value })} className="input text-[12px]" /></div>
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Expiry date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.expiryDate} onChange={(e) => updateSub({ expiryDate: e.target.value })} className="input text-[12px]" /></div>
              </div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max accounts <span style={{ color: "var(--danger)" }}>*</span></label><input type="number" min={1} value={activeSub.maxAccounts} onChange={(e) => updateSub({ maxAccounts: Number(e.target.value) })} className="input text-[12px]" /></div>
              <YesNo label="Status" value={activeSub.status === "Active"} onChange={(v) => updateSub({ status: v ? "Active" : "Inactive" })} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
              <Button variant="secondary" size="sm" onClick={cancelSubModal}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Save} onClick={saveSubModal}>Save Plan</Button>
            </div>
          </div>
        </div>
      )}

      {/* Password-generator toast — bottom-right, auto-dismisses after 3s. */}
      {pwToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[70] rounded-lg px-4 py-3 text-[12px] font-medium shadow-lg"
          style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success)" }}
        >
          {pwToast}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ */

/**
 * Maps a save-time failure to a user-facing message for the toast.
 * Covers AiAuthError shapes (status-coded) and falls back to the raw
 * Error.message for tenant API / generic failures.
 */
function mapCustomerError(err: unknown): string {
  if (err instanceof AiAuthError) {
    if (err.status === 409) return "A customer with this email or username already exists.";
    if (err.status === 422) return "Some fields are invalid. Check the form and try again.";
    if (err.status === 502 || err.status === 503) return "AI service is unavailable. Customer was saved without AI features.";
  }
  // friendlyAiError handles the long technical dumps (OpenAI dict-style
  // payloads, FastAPI validation arrays, network errors) and falls back
  // to a clean sentence when the raw message is structural noise.
  return friendlyAiError(err, "Failed to save customer. Please try again.");
}

interface CustomerAccountsPageProps {
  initialTenants?: Tenant[];
  isSuperAdmin?: boolean;
}

export function CustomerAccountsPage({ initialTenants, isSuperAdmin: isSuperAdminProp }: CustomerAccountsPageProps = {}) {
  const dispatch = useAppDispatch();
  const tenants = useAppSelector((s) => s.auth.tenants);
  // MFA toggle column is super-admin-only — customer_admin can see /admin
  // but must NOT control tenant-level MFA on themselves or others.
  // Server-passed prop is the source of truth for SSR-affected branches;
  // Redux fallback covers any caller that doesn't supply the prop yet.
  const reduxRole = useAppSelector((s) => s.auth.user?.role);
  const isSuperAdmin = isSuperAdminProp ?? reduxRole === "super_admin";
  const [mfaUpdatingId, setMfaUpdatingId] = useState<string | null>(null);
  // Confirmation gate for false→true (server invalidates active sessions on enable).
  const [mfaConfirmTenant, setMfaConfirmTenant] = useState<Tenant | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Post-create subscription flow
  const [postCreateSubOpen, setPostCreateSubOpen] = useState(false);
  const [postCreateTenantId, setPostCreateTenantId] = useState<string | null>(null);
  const [postCreateSubData, setPostCreateSubData] = useState<{ startDate: string; expiryDate: string; maxAccounts: number; status: "Active" | "Inactive" }>({ startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" });
  const [savedPopup, setSavedPopup] = useState<string | null>(null);
  const toast = useToast();

  const router = useRouter();

  // Hydrate Redux from server-fetched tenants (provided by the async Server Component).
  // Falls back to client-side fetch only if initialTenants was not supplied.
  const initialSeeded = useRef(false);
  useEffect(() => {
    if (initialTenants && !initialSeeded.current) {
      dispatch(setTenants(initialTenants));
      initialSeeded.current = true;
      return;
    }
    if (initialSeeded.current) return;
    let cancelled = false;
    setSyncing(true);
    fetchTenants()
      .then((remote) => {
        if (cancelled) return;
        dispatch(setTenants(remote));
        setSyncError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message ?? "";
        if (msg.includes("Not authenticated")) {
          router.push("/login");
          return;
        }
        if (msg.includes("Insufficient permissions")) {
          router.push("/");
          return;
        }
        console.error("[admin] tenant sync failed", err);
        setSyncError(
          "Could not sync customers from the database. Showing local cache only.",
        );
      })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [dispatch, initialTenants, router]);

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const openCreate = () => {
    setEditingTenant(null);
    setModalOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setModalOpen(true);
  };

  const handleSave = async (data: AccountFormData) => {
    if (editingTenant) {
      // If the original create's AI signup failed, the customer admin won't
      // have aiUserId / aiAccessToken set. Retry signup here so the edit
      // recovers the missing token. Skip the retry once aiUserId is present
      // — that's our "already signed up" sentinel and we never re-sign-up.
      const existingAdmin = editingTenant.config.users.find(
        (u) => u.role === "customer_admin" || u.role === "super_admin",
      );
      let retriedAiUserId: string | undefined;
      let retriedAiAccessToken: string | undefined;
      if (existingAdmin && !existingAdmin.aiUserId) {
        // Reuse the admin's existing id as both customer_id and user_id —
        // that id was already generated as a CUST_xxx during the failed create.
        const customerId = existingAdmin.id;
        try {
          const res = await aiSignup({
            user_id: customerId,
            username: data.username,
            email: data.email,
            password: data.newPassword || existingAdmin.password || "",
            customer_id: customerId,
            role: "customer_admin",
          });
          retriedAiUserId = customerId;
          retriedAiAccessToken = res.access_token;
        } catch (err) {
          const reason = err instanceof AiAuthError ? err.message : "unknown";
          console.error("[admin] AI signup retry on edit failed:", reason);
        }
      }

      // Update existing admin user in the tenant's user list
      const updatedUsers = editingTenant.config.users.map((u) =>
        u.role === "customer_admin" || u.role === "super_admin"
          ? {
              ...u,
              name: data.customerName,
              email: data.email,
              username: data.username,
              // Only overwrite password if a new one was entered
              ...(data.newPassword ? { password: data.newPassword } : {}),
              status: data.active ? "Active" as const : "Inactive" as const,
              ...(retriedAiUserId ? { aiUserId: retriedAiUserId } : {}),
              ...(retriedAiAccessToken ? { aiAccessToken: retriedAiAccessToken } : {}),
            }
          : u,
      );
      const patch: Partial<Tenant> = {
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        subscriptionPlans: data.subscriptionPlans.map((sp) => ({
          id: sp.id,
          startDate: sp.startDate,
          endDate: sp.expiryDate,
          maxAccounts: sp.maxAccounts,
          status: sp.status,
          createdAt: new Date().toISOString(),
        })),
        config: {
          ...editingTenant.config,
          org: {
            ...editingTenant.config.org,
            companyName: data.customerName,
            timezone: data.timezone,
          },
          users: updatedUsers,
        },
      };
      // Optimistic local update
      dispatch(updateTenant({ id: editingTenant.id, patch }));
      let updateOk = false;
      let updateError: unknown = null;
      try {
        await updateTenantApi(editingTenant.id, patch);
        updateOk = true;
      } catch (err) {
        updateError = err;
        console.error("[admin] failed to persist tenant update", err);
        setSyncError("Saved locally but failed to sync to the database.");
      }
      if (updateOk) {
        toast.success(`Customer "${data.customerName}" updated.`);
      } else {
        toast.error(`Saved locally but failed to sync "${data.customerName}": ${mapCustomerError(updateError)}`);
      }
      // MFA changes route through toggleTenantMFA so the audit pair and
      // sessionsValidAfter bump fire. Don't include mfaEnabled in the
      // generic patch — that would skip the audit/session-invalidation.
      // Defensive: only super_admin can change MFA. The modal's MFA toggle is
      // already gated, so this is a belt-and-braces check against future
      // callers that might not enforce the UI gate.
      if (isSuperAdmin && data.mfaEnabled !== !!editingTenant.mfaEnabled) {
        try {
          const result = await toggleTenantMFA(editingTenant.id, data.mfaEnabled);
          if (!result.success) {
            // Roll back the optimistic local flip done above by re-dispatching.
            dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: !!editingTenant.mfaEnabled } }));
            setSyncError(friendlyError(result.error));
          } else {
            dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: data.mfaEnabled } }));
          }
        } catch (err) {
          console.error("[admin] toggleTenantMFA failed", err);
          dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: !!editingTenant.mfaEnabled } }));
          setSyncError(friendlyError(undefined));
        }
      }
    } else {
      const tenantId = `tenant-${Date.now()}`;
      // Customer admin: customer_id is auto-generated AND used as the user_id
      // for that admin (per spec). Both fields share the same CUST_xxx value.
      const customerId = generateCustomerId();
      const adminUserId = customerId;

      // Sign up the customer admin against the AI backend so they get an
      // access token and can call protected endpoints. Stash the token + id
      // on the user record. If signup fails (network, duplicate, etc.) we
      // still create the local account but log the reason — the admin can
      // re-trigger by editing later (we'll need to expose that).
      let aiUserId: string | undefined;
      let aiAccessToken: string | undefined;
      let aiSignupOk = false;
      let aiSignupError: unknown = null;
      try {
        const res = await aiSignup({
          user_id: adminUserId,
          username: data.username,
          email: data.email,
          password: data.newPassword,
          customer_id: customerId,
          role: "customer_admin",
        });
        aiUserId = adminUserId;
        aiAccessToken = res.access_token;
        aiSignupOk = true;
      } catch (err) {
        aiSignupError = err;
        console.error("[admin] AI signup failed for customer admin — saving locally only:", err);
        setSyncError(`Customer saved, but AI features need a retry. ${mapCustomerError(err)} Edit the customer to retry.`);
      }

      const newTenant: Tenant = {
        id: tenantId,
        name: data.customerName,
        plan: "enterprise",
        adminEmail: data.email,
        createdAt: new Date().toISOString(),
        active: data.active,
        mfaEnabled: data.mfaEnabled,
        subscriptionPlans: data.subscriptionPlans.map((sp) => ({
          id: sp.id,
          startDate: sp.startDate,
          endDate: sp.expiryDate,
          maxAccounts: sp.maxAccounts,
          status: sp.status,
          createdAt: new Date().toISOString(),
        })),
        config: {
          org: {
            companyName: data.customerName,
            timezone: data.timezone,
            dateFormat: "DD/MM/YYYY",
            regulatoryRegion: "",
          },
          sites: [],
          users: [
            {
              id: adminUserId,
              name: data.customerName,
              email: data.email,
              username: data.username,
              password: data.newPassword,
              role: "customer_admin",
              gxpSignatory: true,
              status: "Active",
              assignedSites: [],
              allSites: true,
              aiUserId,
              aiAccessToken,
            },
          ],
        },
      };
      // Optimistic local insert
      dispatch(addTenant(newTenant));
      let tenantApiOk = false;
      let tenantApiError: unknown = null;
      try {
        await createTenantApi(newTenant);
        tenantApiOk = true;
      } catch (err) {
        tenantApiError = err;
        console.error("[admin] failed to persist new tenant", err);
        setSyncError("Saved locally but failed to sync to the database.");
      }

      // Outcome toast — distinguishes the three real-world cases:
      //   1) Tenant DB write failed → critical: the user must retry.
      //   2) Tenant DB ok but AI signup failed → soft: customer exists but
      //      AI chatbot/CAPA features won't work until edit-retry.
      //   3) Both ok → green path.
      if (!tenantApiOk) {
        toast.error(`Failed to save "${data.customerName}": ${mapCustomerError(tenantApiError)}`);
      } else if (!aiSignupOk) {
        toast.success(`Customer "${data.customerName}" created. AI features will activate shortly. (${mapCustomerError(aiSignupError)})`);
      } else {
        toast.success(`Customer "${data.customerName}" created with AI access.`);
      }

      // Auto-open subscription modal if no plan was added in the drawer
      if (data.subscriptionPlans.length === 0) {
        setPostCreateTenantId(tenantId);
        setPostCreateSubData({ startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" });
        setPostCreateSubOpen(true);
      } else {
        setSavedPopup("Account and subscription created");
      }
    }
  };

  // Translate server-action error codes into user-facing sentences. The raw
  // codes ("FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED") were leaking into the
  // sync banner verbatim, which is confusing to non-developers and obscures
  // the actual remediation step. Used at every MFA error surface.
  const friendlyError = (code: string | undefined): string => {
    if (code === "FORBIDDEN") return "Only Super Admin can change MFA settings.";
    if (code === "NOT_FOUND") return "Tenant not found.";
    if (code === "UNAUTHORIZED") return "Your session has expired. Please log in again.";
    return code || "Failed to update MFA setting.";
  };

  const handleToggleMFA = async (tenant: Tenant, next: boolean) => {
    if (!isSuperAdmin) return;
    setMfaUpdatingId(tenant.id);
    // Optimistic local flip — server result will revalidate via revalidatePath.
    dispatch(updateTenant({ id: tenant.id, patch: { mfaEnabled: next } }));
    try {
      const result = await toggleTenantMFA(tenant.id, next);
      if (!result.success) {
        // Roll back the optimistic update.
        dispatch(updateTenant({ id: tenant.id, patch: { mfaEnabled: !next } }));
        setSyncError(friendlyError(result.error));
      }
    } catch (err) {
      console.error("[admin] toggleTenantMFA failed", err);
      dispatch(updateTenant({ id: tenant.id, patch: { mfaEnabled: !next } }));
      setSyncError(friendlyError(undefined));
    } finally {
      setMfaUpdatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingTenant) return;
    setDeleting(true);
    const id = deletingTenant.id;
    // Optimistic local removal
    dispatch(removeTenant(id));
    try {
      await deleteTenantApi(id);
      setDeletingTenant(null);
    } catch (err) {
      console.error("[admin] failed to delete tenant", err);
      setSyncError("Removed locally but failed to delete from the database.");
      setDeletingTenant(null);
    } finally {
      setDeleting(false);
    }
  };

  const getFormData = (): AccountFormData => {
    if (!editingTenant) return makeEmptyForm();
    const admin = editingTenant.config.users.find(
      (u) => u.role === "customer_admin" || u.role === "super_admin",
    );
    return {
      customerName: editingTenant.name,
      username: admin?.username ?? admin?.email?.split("@")[0] ?? "",
      email: editingTenant.adminEmail,
      language: "English, United States",
      timezone: editingTenant.config.org.timezone,
      active: editingTenant.active,
      mfaEnabled: !!editingTenant.mfaEnabled,
      newPassword: "",
      confirmPassword: "",
      subscriptionPlans: (editingTenant.subscriptionPlans ?? []).map((sp) => ({
        id: sp.id,
        startDate: sp.startDate,
        expiryDate: sp.endDate,
        maxAccounts: sp.maxAccounts,
        status: sp.status,
      })),
      logoFile: null,
    };
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
            Customer Accounts
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Manage customer organizations and their admin accounts
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          New Account
        </Button>
      </div>

      {/* Sync status banner */}
      {syncing && (
        <div
          role="status"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
        >
          Syncing customers from database…
        </div>
      )}
      {syncError && (
        <div
          role="alert"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning)" }}
        >
          {syncError}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-3 text-[13px] outline-none transition-all"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--bg-border)",
              color: "var(--text-primary)",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Organizations", value: tenants.length, icon: Building2, color: "var(--brand)" },
          { label: "Total Users", value: tenants.reduce((sum, t) => sum + t.config.users.length, 0), icon: Users, color: "var(--success)" },
          { label: "Total Sites", value: tenants.reduce((sum, t) => sum + t.config.sites.length, 0), icon: MapPin, color: "var(--warning)" },
        ].map((stat) => (
          <div key={stat.label} className="stat-card flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: stat.color + "15" }}
            >
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} aria-hidden="true" />
            </div>
            <div>
              <p className="stat-label">{stat.label}</p>
              <p className="text-[24px] font-bold" style={{ color: "var(--card-text)" }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Organizations</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {tenants.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Customer accounts">
            <thead>
              <tr>
                <th scope="col">Organization</th>
                <th scope="col">Plan</th>
                <th scope="col">Users / Sites</th>
                <th scope="col">Status</th>
                {isSuperAdmin && <th scope="col">MFA</th>}
                <th scope="col">Created</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => {
                const effective = isTenantEffectivelyActive(tenant);
                const reason = getInactiveReason(tenant);
                const activeSub = (tenant.subscriptionPlans ?? []).find((p) => (p.status ?? "").toLowerCase() === "active");
                const expiry = activeSub ? ((activeSub as unknown as Record<string, unknown>).expiryDate ?? activeSub.endDate) as string | undefined : undefined;
                const initial = tenant.name.charAt(0).toUpperCase();
                return (
                  <tr key={tenant.id}>
                    {/* Organization */}
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[14px] font-bold" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>{initial}</div>
                        <div className="min-w-0">
                          <Link href={`/admin/customer/${tenant.id}`} className="text-[13px] font-semibold hover:underline block truncate" style={{ color: "var(--text-primary)" }}>{tenant.name}</Link>
                          <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{tenant.adminEmail}</p>
                        </div>
                      </div>
                    </td>
                    {/* Plan */}
                    <td>
                      <div className="text-[12px]">
                        <p className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>{tenant.plan}</p>
                        {activeSub ? (
                          <>
                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{activeSub.maxAccounts === -1 ? "Unlimited" : `${activeSub.maxAccounts} accounts`}</p>
                            {expiry && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Expires {dayjs(expiry).format("MMM D, YYYY")}</p>}
                          </>
                        ) : (
                          <p className="text-[10px]" style={{ color: "var(--danger)" }}>No plan</p>
                        )}
                      </div>
                    </td>
                    {/* Users / Sites */}
                    <td>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {tenant.config.users.length} users &middot; {tenant.config.sites.length} sites
                      </span>
                    </td>
                    {/* Status */}
                    <td>
                      <Badge variant={effective ? "green" : "red"}>{effective ? "Active" : "Inactive"}</Badge>
                      {!effective && reason && (
                        <span className="block text-[10px] mt-0.5 max-w-[120px] truncate" style={{ color: "var(--text-muted)" }} title={reason}>
                          {reason.includes("expired") ? "Subscription expired" : reason.includes("deactivated") ? "Deactivated" : "No subscription"}
                        </span>
                      )}
                    </td>
                    {/* MFA — super_admin only */}
                    {isSuperAdmin && (
                      <td>
                        {(() => {
                          const on = !!tenant.mfaEnabled;
                          const updating = mfaUpdatingId === tenant.id;
                          return (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`MFA Required for ${tenant.name}: ${on ? "on" : "off"}`}
                              disabled={updating}
                              onClick={() => {
                                if (on) {
                                  handleToggleMFA(tenant, false);
                                } else {
                                  setMfaConfirmTenant(tenant);
                                }
                              }}
                              className="toggle-track"
                              style={{
                                background: on ? "var(--brand)" : "var(--bg-elevated)",
                                borderColor: on ? "var(--brand)" : "var(--bg-border)",
                                opacity: updating ? 0.6 : 1,
                                cursor: updating ? "wait" : "pointer",
                              }}
                            >
                              <span
                                className="toggle-thumb"
                                style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
                              />
                              <span className="sr-only">{on ? "On" : "Off"}</span>
                            </button>
                          );
                        })()}
                      </td>
                    )}
                    {/* Created */}
                    <td>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {dayjs(tenant.createdAt).format("MMM D, YYYY")}
                      </span>
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/customer/${tenant.id}`}>
                          <Button variant="ghost" size="xs" aria-label={`View ${tenant.name}`}>View</Button>
                        </Link>
                        <Button variant="ghost" size="xs" icon={Pencil} onClick={() => openEdit(tenant)} aria-label={`Edit ${tenant.name}`} />
                        <button
                          type="button"
                          onClick={() => setDeletingTenant(tenant)}
                          aria-label={`Delete ${tenant.name}`}
                          className="p-1.5 rounded border-none cursor-pointer transition-colors"
                          style={{ background: "transparent", color: "var(--danger)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 7 : 6} className="text-center py-10">
                    <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                      {searchQuery ? "No organizations match your search" : "No customer accounts yet"}
                    </p>
                    <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
                      {searchQuery ? "Try a different search term." : "Add your first customer to get started."}
                    </p>
                    {!searchQuery && <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>Add Customer</Button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account modal */}
      <AccountDrawer
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTenant(null);
        }}
        onSave={handleSave}
        initial={getFormData()}
        mode={editingTenant ? "edit" : "create"}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Delete confirmation modal */}
      {deletingTenant && (
        <Modal
          open
          onClose={() => !deleting && setDeletingTenant(null)}
          title="Delete Customer Account"
        >
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
            >
              <Trash2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
                  This action cannot be undone
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  All sites, users, and subscription plans for this account will be permanently deleted from the database.
                </p>
              </div>
            </div>

            <div>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                You are about to delete:
              </p>
              <p className="text-[15px] font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
                {deletingTenant.name}
              </p>
              <p className="text-[12px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                {deletingTenant.adminEmail}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeletingTenant(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={handleDelete}
                loading={deleting}
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Post-create subscription modal */}
      {postCreateSubOpen && postCreateTenantId && (
        <Modal
          open
          onClose={() => { setPostCreateSubOpen(false); setPostCreateTenantId(null); setSavedPopup("Account created (no subscription)"); }}
          title="Add Subscription Plan"
        >
          <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Set up a subscription so users can log in.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start date <span style={{ color: "var(--danger)" }}>*</span></label>
                <input type="date" value={postCreateSubData.startDate} onChange={(e) => setPostCreateSubData((p) => ({ ...p, startDate: e.target.value }))} className="input text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Expiry date <span style={{ color: "var(--danger)" }}>*</span></label>
                <input type="date" value={postCreateSubData.expiryDate} onChange={(e) => setPostCreateSubData((p) => ({ ...p, expiryDate: e.target.value }))} className="input text-[12px]" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Max accounts <span style={{ color: "var(--danger)" }}>*</span></label>
              <input type="number" min={1} value={postCreateSubData.maxAccounts} onChange={(e) => setPostCreateSubData((p) => ({ ...p, maxAccounts: Number(e.target.value) }))} className="input text-[12px]" />
            </div>
            <YesNo label="Status" value={postCreateSubData.status === "Active"} onChange={(v) => setPostCreateSubData((p) => ({ ...p, status: v ? "Active" : "Inactive" }))} />
          </div>
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <button
              type="button"
              onClick={() => { setPostCreateSubOpen(false); setPostCreateTenantId(null); setSavedPopup("Account created \u2014 no subscription added"); }}
              className="text-[11px] font-medium border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }}
            >
              Skip for now
            </button>
            <Button variant="primary" size="sm" icon={Save} onClick={async () => {
              const tenant = tenants.find((t) => t.id === postCreateTenantId);
              if (!tenant) return;
              const plan = { id: `sp-${Date.now()}`, startDate: postCreateSubData.startDate, endDate: postCreateSubData.expiryDate, maxAccounts: postCreateSubData.maxAccounts, status: postCreateSubData.status, createdAt: new Date().toISOString() };
              const patch: Partial<Tenant> = { subscriptionPlans: [...(tenant.subscriptionPlans ?? []), plan] };
              dispatch(updateTenant({ id: postCreateTenantId, patch }));
              try { await updateTenantApi(postCreateTenantId, patch); } catch { setSyncError("Saved locally but failed to sync."); }
              setPostCreateSubOpen(false);
              setPostCreateTenantId(null);
              setSavedPopup("Account and subscription created");
            }}>Save Plan</Button>
          </div>
        </Modal>
      )}

      {/* MFA enable confirmation — toggleTenantMFA bumps sessionsValidAfter,
          which signs out every active user in the tenant. */}
      {mfaConfirmTenant && (
        <Modal open onClose={() => setMfaConfirmTenant(null)} title="Enable MFA Required?">
          <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Enabling MFA will sign out all current users in <strong style={{ color: "var(--text-primary)" }}>{mfaConfirmTenant.name}</strong>. They&apos;ll need to sign in again with email OTP. Continue?
          </p>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Button variant="secondary" size="sm" onClick={() => setMfaConfirmTenant(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const t = mfaConfirmTenant;
                setMfaConfirmTenant(null);
                handleToggleMFA(t, true);
              }}
            >
              Enable MFA
            </Button>
          </div>
        </Modal>
      )}

      {/* Success toast */}
      {savedPopup && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success)", color: "var(--success)" }}
        >
          <span className="text-[13px] font-semibold">{savedPopup}</span>
          <button type="button" onClick={() => setSavedPopup(null)} className="ml-2 border-none bg-transparent cursor-pointer" style={{ color: "var(--success)" }} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
