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
  setTenantPlan,
  type Tenant,
  type PlanConfig,
} from "@/store/auth.slice";
import { fetchTenants, createTenantApi, updateTenantApi, deleteTenantApi, TenantApiError } from "@/lib/tenantApi";
import { toggleTenantMFA, assignPlan } from "@/actions/tenants";
import { TAILORED_CEILINGS, resolvePlanCaps, planLabel, type PlanTier } from "@/lib/plans";
import { friendlyAiError } from "@/lib/friendlyError";
import { planState } from "@/lib/tenantStatus";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { evaluatePasswordStrength, generateStrongPassword } from "@/lib/passwords";
import dayjs from "@/lib/dayjs";

/* ── Helpers ── */


/* ── Plan draft (Subscription Phase A) ── */

interface PlanDraft {
  tier: PlanTier;
  displayName: string; // TAILORED only
  maxUsers: number;
  maxSites: number;
  minRetentionYears: number;
  startDate: string; // YYYY-MM-DD
  expiryDate: string;
}

/** A fresh plan draft for the given tier, caps resolved from the tier defaults. */
function makePlanDraft(tier: PlanTier = "PROFESSIONAL"): PlanDraft {
  const caps = resolvePlanCaps(tier);
  return {
    tier,
    displayName: "",
    maxUsers: caps.maxUsers,
    maxSites: caps.maxSites,
    minRetentionYears: caps.minRetentionYears,
    startDate: dayjs().format("YYYY-MM-DD"),
    expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"),
  };
}

/** Map a Redux PlanConfig to the editable draft. */
function planConfigToDraft(pc: PlanConfig): PlanDraft {
  return {
    tier: pc.tier,
    displayName: pc.displayName ?? "",
    maxUsers: pc.maxUsers,
    maxSites: pc.maxSites,
    minRetentionYears: pc.minRetentionYears,
    startDate: dayjs.utc(pc.startDate).format("YYYY-MM-DD"),
    expiryDate: dayjs.utc(pc.expiryDate).format("YYYY-MM-DD"),
  };
}

/** Map an editable draft to a Redux PlanConfig; caps are frozen via resolvePlanCaps. */
function draftToPlanConfig(d: PlanDraft, id: string): PlanConfig {
  const caps = resolvePlanCaps(d.tier, { maxUsers: d.maxUsers, maxSites: d.maxSites, minRetentionYears: d.minRetentionYears });
  return {
    id,
    tier: d.tier,
    displayName: d.tier === "TAILORED" ? (d.displayName.trim() || null) : null,
    maxUsers: caps.maxUsers,
    maxSites: caps.maxSites,
    minRetentionYears: caps.minRetentionYears,
    startDate: dayjs.utc(d.startDate).toISOString(),
    expiryDate: dayjs.utc(d.expiryDate).toISOString(),
  };
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
  plan: PlanDraft | null;
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
    plan: null,
    logoFile: null,
  };
}

/* ── Account Drawer (replaces nested modals) ── */

/** Derive a username from an email local-part, sanitised to the existing
 *  ^[a-z0-9_]+$ rule: drop the domain, lowercase, collapse any run of
 *  disallowed chars into a single underscore, and trim edge underscores.
 *  e.g. "Admin.User@novagen.com" -> "admin_user". */
function deriveUsername(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  const [subSnapshot, setSubSnapshot] = useState<PlanDraft | null>(null);
  // Drag-drop overlay: only shown when the user is actively dragging a file
  // over the modal. Keeps the body uncluttered in the common no-drag state.
  const [isDragging, setIsDragging] = useState(false);
  // Password UX state — show/hide eyes + a 3s toast after generate.
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwToast, setPwToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Username auto-derive (create form only): while true, the username field
  // mirrors a sanitised version of the email local-part. Flips false the
  // moment super_admin edits the username manually, handing them control.
  // Edit mode starts false so an existing username is never overwritten.
  const [usernameAuto, setUsernameAuto] = useState(mode === "create");

  useEffect(() => {
    if (open) {
      setForm(initial);
      setTouched({});
      setSubmitAttempted(false);
      setSubModalOpen(false);
      setUsernameAuto(mode === "create");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Errors are derived from form + mode on every render — no setErrors. This
  // lets the inline error text disappear the instant the user fixes a field,
  // without waiting for another submit click to refresh state.
  // Validation rules mirror the server-side Zod schema in
  // src/actions/tenants.ts (CreateTenantSchema) so the modal can't accept
  // values that will fail at the server with "Validation failed". Keep
  // these in lockstep when the schema changes.
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const name = form.customerName.trim();
    if (!name) e.customerName = "Required";
    else if (name.length < 2) e.customerName = "Must be at least 2 characters";

    const uname = form.username.trim();
    if (!uname) e.username = "Required";
    else if (uname.length < 2) e.username = "Must be at least 2 characters";
    else if (!/^[a-z0-9_]+$/.test(uname)) e.username = "Lowercase letters, digits, and underscores only";

    const email = form.email.trim();
    if (!email) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";

    if (mode === "create") {
      if (!form.newPassword) e.newPassword = "Required";
      else if (form.newPassword.length < 6) e.newPassword = "Must be at least 6 characters";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    } else if (form.newPassword) {
      if (form.newPassword.length < 6) e.newPassword = "Must be at least 6 characters";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
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
  // No length minimums — the strength meter is informational and never blocks
  // submission; only required-ness, username/email format, and match are gated.
  const canSave =
    form.customerName.trim().length >= 2 &&
    form.username.trim().length >= 2 &&
    /^[a-z0-9_]+$/.test(form.username.trim()) &&
    form.email.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    (mode === "edit"
      ? (!form.newPassword || (form.newPassword.length >= 6 && form.newPassword === form.confirmPassword))
      : form.newPassword.length >= 6 && form.newPassword === form.confirmPassword);

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

  // Plan helpers (single plan per tenant)
  const activeSub = form.plan;
  const updateSub = (patch: Partial<PlanDraft>) => {
    if (activeSub) set("plan", { ...activeSub, ...patch });
  };
  // Switching tier re-freezes caps from the tier defaults. TAILORED keeps its
  // editable caps; fixed tiers reset to preset caps and clear displayName.
  const changeTier = (tier: PlanTier) => {
    if (!activeSub) return;
    if (tier === "TAILORED") {
      set("plan", { ...activeSub, tier });
    } else {
      const caps = resolvePlanCaps(tier);
      set("plan", { ...activeSub, tier, displayName: "", maxUsers: caps.maxUsers, maxSites: caps.maxSites, minRetentionYears: caps.minRetentionYears });
    }
  };
  const addSub = () => {
    set("plan", makePlanDraft());
  };

  const LABEL = "block text-[11px] font-medium mb-1" as const;

  if (!open) return null;

  const openSubModal = () => {
    setSubSnapshot(activeSub ? { ...activeSub } : null);
    setSubModalOpen(true);
  };
  const cancelSubModal = () => {
    set("plan", subSnapshot);
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
                onChange={(e) => { setUsernameAuto(false); set("username", e.target.value); }}
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
                onChange={(e) => {
                  const v = e.target.value;
                  set("email", v);
                  if (usernameAuto) set("username", deriveUsername(v));
                }}
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
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>{planLabel(activeSub.tier, activeSub.displayName)}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>&middot; {activeSub.maxUsers} users \u00b7 {activeSub.maxSites} sites \u00b7 {activeSub.minRetentionYears}yr retention</span>
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Expires {activeSub.expiryDate ? dayjs(activeSub.expiryDate).format("MMM D, YYYY") : "\u2014"}</p>
                </div>
                <button type="button" onClick={openSubModal} className="text-[11px] font-medium border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--brand)" }}>Edit Plan</button>
              </div>
            ) : (
              // Neutral card — "no subscription" is the default state for a fresh tenant,
              // not a warning. Warning amber reserved for actual expiry/inactive cases.
              <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No plan assigned</span>
                <button type="button" onClick={() => { addSub(); openSubModal(); }} className="text-[11px] font-semibold border-none bg-transparent cursor-pointer" style={{ color: "var(--brand)" }}>+ Assign Plan</button>
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
              <div>
                <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Plan tier <span style={{ color: "var(--danger)" }}>*</span></label>
                <select value={activeSub.tier} onChange={(e) => changeTier(e.target.value as PlanTier)} className="input text-[12px]">
                  <option value="ESSENTIALS">Essentials</option>
                  <option value="PROFESSIONAL">Professional</option>
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="TAILORED">Tailored</option>
                </select>
              </div>
              {activeSub.tier === "TAILORED" && (
                <div>
                  <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Display name</label>
                  <input type="text" placeholder="TAILORED" value={activeSub.displayName} onChange={(e) => updateSub({ displayName: e.target.value })} className="input text-[12px]" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Start date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.startDate} onChange={(e) => updateSub({ startDate: e.target.value })} className="input text-[12px]" /></div>
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Expiry date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.expiryDate} onChange={(e) => updateSub({ expiryDate: e.target.value })} className="input text-[12px]" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max users</label><input type="number" min={1} max={TAILORED_CEILINGS.maxUsers} value={activeSub.maxUsers} disabled={activeSub.tier !== "TAILORED"} onChange={(e) => updateSub({ maxUsers: Number(e.target.value) })} className="input text-[12px]" /></div>
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max sites</label><input type="number" min={1} max={TAILORED_CEILINGS.maxSites} value={activeSub.maxSites} disabled={activeSub.tier !== "TAILORED"} onChange={(e) => updateSub({ maxSites: Number(e.target.value) })} className="input text-[12px]" /></div>
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Retention (yr)</label><input type="number" min={1} max={TAILORED_CEILINGS.minRetentionYears} value={activeSub.minRetentionYears} disabled={activeSub.tier !== "TAILORED"} onChange={(e) => updateSub({ minRetentionYears: Number(e.target.value) })} className="input text-[12px]" /></div>
              </div>
              {activeSub.tier !== "TAILORED" ? (
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Caps are fixed for this tier. Choose Tailored to set custom caps.</p>
              ) : (
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Tailored ceilings: {TAILORED_CEILINGS.maxUsers} users / {TAILORED_CEILINGS.maxSites} sites / {TAILORED_CEILINGS.minRetentionYears}yr.</p>
              )}
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
 * TenantApiError carries server fieldErrors (Zod failures) — surface
 * them inline so the user knows which field is wrong instead of the
 * generic "Validation failed" sentence.
 */
function mapCustomerError(err: unknown): string {
  if (err instanceof TenantApiError) {
    if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      const fieldLabels: Record<string, string> = {
        name: "Customer name",
        email: "Email",
        username: "Username",
        password: "Password",
        customerCode: "Customer code",
      };
      const parts = Object.entries(err.fieldErrors).map(([field, msgs]) => {
        const label = fieldLabels[field] ?? field;
        return `${label}: ${(msgs ?? []).join(", ")}`;
      });
      return parts.join(" · ");
    }
    return err.message;
  }
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
  const [postCreateSubData, setPostCreateSubData] = useState<PlanDraft>(makePlanDraft());
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
            }
          : u,
      );
      const patch: Partial<Tenant> = {
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        plan: data.plan ? draftToPlanConfig(data.plan, editingTenant.plan?.id ?? `plan-${Date.now()}`) : null,
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
      // Server-first: write to the DB first; only mutate Redux on success.
      // Prevents the "saved locally but not in DB" phantom state that left
      // the tenant unreachable for login on subsequent attempts.
      try {
        await updateTenantApi(editingTenant.id, patch);
        dispatch(updateTenant({ id: editingTenant.id, patch }));
        // updateTenantApi only carries name/email/active — persist the plan
        // separately via assignPlan (caps are frozen server-side).
        if (data.plan) {
          const planRes = await assignPlan({
            tenantId: editingTenant.id,
            tier: data.plan.tier,
            displayName: data.plan.tier === "TAILORED" ? (data.plan.displayName || undefined) : undefined,
            maxUsers: data.plan.maxUsers,
            maxSites: data.plan.maxSites,
            minRetentionYears: data.plan.minRetentionYears,
            startDate: data.plan.startDate,
            expiryDate: data.plan.expiryDate,
          });
          if (!planRes.success) console.warn("[admin] assignPlan failed:", planRes.error);
        }
        setSyncError(null);
        toast.success(`Customer ${data.customerName} updated.`);
      } catch (err) {
        console.error("[admin] failed to persist tenant update", err);
        setSyncError(null);
        toast.error(`Could not update ${data.customerName}: ${mapCustomerError(err)}`);
        return;
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
      // Customer admin user id: reuse the tenant id so the admin record has a
      // stable, predictable handle without any external AI-backend signup.
      const adminUserId = tenantId;

      const newTenant: Tenant = {
        id: tenantId,
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        mfaEnabled: data.mfaEnabled,
        plan: data.plan ? draftToPlanConfig(data.plan, `plan-${Date.now()}`) : null,
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
            },
          ],
        },
      };
      // Server-first: write to the DB first; only insert into Redux on
      // success. Prevents the "saved locally but not in DB" phantom state
      // that left the new customer unable to sign in (the DB lookup at
      // login would return nothing while Redux still showed the row).
      try {
        await createTenantApi(newTenant);
      } catch (err) {
        console.error("[admin] failed to persist new tenant", err);
        setSyncError(null);
        toast.error(`Could not create ${data.customerName}: ${mapCustomerError(err)}`);
        return;
      }
      dispatch(addTenant(newTenant));
      setSyncError(null);
      toast.success(`Customer ${data.customerName} created.`);

      // Auto-open the plan-assignment modal if no plan was set in the drawer
      if (!data.plan) {
        setPostCreateTenantId(tenantId);
        setPostCreateSubData(makePlanDraft());
        setPostCreateSubOpen(true);
      } else {
        setSavedPopup("Account and plan created");
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
      plan: editingTenant.plan ? planConfigToDraft(editingTenant.plan) : null,
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
            placeholder="Search organizations…"
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
                const tenantPlan = tenant.plan;
                const expiry = tenantPlan?.expiryDate;
                const plState = planState(tenant);
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
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{tenantPlan ? planLabel(tenantPlan.tier, tenantPlan.displayName) : "—"}</p>
                        {tenantPlan ? (
                          <>
                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{tenantPlan.maxUsers} users · {tenantPlan.maxSites} sites</p>
                            {expiry && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Expires {dayjs.utc(expiry).format("MMM D, YYYY")}</p>}
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
                      <Badge variant={tenant.active ? "green" : "red"}>{tenant.active ? "Active" : "Suspended"}</Badge>
                      {tenant.active && plState !== "ok" && (
                        <span className="block text-[10px] mt-0.5 max-w-[120px] truncate" style={{ color: "var(--text-muted)" }}>
                          {plState === "none" ? "No plan" : "Plan expired"}
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
                        {tenant.createdAt ? dayjs(tenant.createdAt).format("MMM D, YYYY") : "—"}
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
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Plan tier <span style={{ color: "var(--danger)" }}>*</span></label>
              <select value={postCreateSubData.tier} onChange={(e) => {
                const tier = e.target.value as PlanTier;
                setPostCreateSubData((p) => tier === "TAILORED" ? { ...p, tier } : { ...p, tier, displayName: "", ...resolvePlanCaps(tier) });
              }} className="input text-[12px]">
                <option value="ESSENTIALS">Essentials</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="TAILORED">Tailored</option>
              </select>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{postCreateSubData.maxUsers} users · {postCreateSubData.maxSites} sites · {postCreateSubData.minRetentionYears}yr retention</p>
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
              const draft = postCreateSubData;
              const res = await assignPlan({
                tenantId: postCreateTenantId,
                tier: draft.tier,
                displayName: draft.tier === "TAILORED" ? (draft.displayName || undefined) : undefined,
                maxUsers: draft.maxUsers,
                maxSites: draft.maxSites,
                minRetentionYears: draft.minRetentionYears,
                startDate: draft.startDate,
                expiryDate: draft.expiryDate,
              });
              if (!res.success) {
                toast.error(`Could not assign plan: ${res.error}`);
                return;
              }
              dispatch(setTenantPlan({ tenantId: postCreateTenantId, plan: draftToPlanConfig(draft, `plan-${Date.now()}`) }));
              setPostCreateSubOpen(false);
              setPostCreateTenantId(null);
              setSavedPopup("Account and plan created");
            }}>Assign Plan</Button>
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
