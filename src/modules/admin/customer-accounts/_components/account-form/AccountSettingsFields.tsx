"use client";

import { Toggle } from "@/components/ui/Toggle";
import { Dropdown } from "@/components/ui/Dropdown";
import { type AccountFormData, type AccountFormSetter } from "../../helpers";

const LABEL = "block text-[11px] font-medium mb-1" as const;

const LANGUAGE_OPTIONS = [
  { value: "English, United States", label: "English, United States" },
  { value: "English, United Kingdom", label: "English, United Kingdom" },
  { value: "Hindi", label: "Hindi" },
  { value: "Arabic", label: "Arabic" },
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Asia/Qatar", label: "Asia/Qatar" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
];

interface AccountSettingsFieldsProps {
  form: AccountFormData;
  set: AccountFormSetter;
  mode: "create" | "edit";
  isSuperAdmin: boolean;
}

export function AccountSettingsFields({ form, set, mode, isSuperAdmin }: AccountSettingsFieldsProps) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Settings</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Language</label><Dropdown value={form.language} onChange={(v) => set("language", v)} options={LANGUAGE_OPTIONS} width="w-full" size="sm" /></div>
        <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Time Zone</label><Dropdown value={form.timezone} onChange={(v) => set("timezone", v)} options={TIMEZONE_OPTIONS} width="w-full" size="sm" /></div>
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
  );
}
