"use client";

import { useRef } from "react";
import { Upload, FileText } from "lucide-react";
import { type AccountFormData, type AccountFormSetter } from "../../helpers";

const LABEL = "block text-[11px] font-medium mb-1" as const;

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

interface AccountInfoFieldsProps {
  form: AccountFormData;
  set: AccountFormSetter;
  markTouched: (field: string) => void;
  errorVisible: (name: string) => boolean;
  errors: Record<string, string>;
  usernameAuto: boolean;
  setUsernameAuto: (value: boolean) => void;
}

export function AccountInfoFields({ form, set, markTouched, errorVisible, errors, usernameAuto, setUsernameAuto }: AccountInfoFieldsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => set("logoFile", e.target.files?.[0] ?? null);

  return (
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
  );
}
