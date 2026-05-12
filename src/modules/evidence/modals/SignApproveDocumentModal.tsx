"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Substage 5.4 — Part 11 e-signature modal for document approval.
 *
 * Mirrors the SignClose / SignSubmit modal pattern: collects a password
 * (re-auth under §11.200(a)(1)(ii)) and forwards it to the parent's
 * submit handler. The signatureMeaning is fixed to "Approved" — document
 * approval has no other meaning options to choose from. The server action
 * (approveDocument) re-verifies the password, mints a SignedRecord row,
 * and links it back via Document.approvalSignatureId.
 */
export interface SignApproveDocumentModalProps {
  open: boolean;
  documentTitle: string;
  documentVersion: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (data: { password: string }) => void;
}

export function SignApproveDocumentModal({
  open,
  documentTitle,
  documentVersion,
  busy,
  error,
  onClose,
  onConfirm,
}: SignApproveDocumentModalProps) {
  const [password, setPassword] = useState("");

  const handleConfirm = () => {
    onConfirm({ password });
    setPassword("");
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Sign &amp; Approve Document"
    >
      <p
        id="sign-doc-notice"
        className="alert alert-info mb-4 text-[12px]"
      >
        This is a GxP electronic signature under 21 CFR Part 11. Your
        identity, the meaning of this signature (Approved), and a content
        hash will be recorded and cannot be altered.
      </p>
      <div
        className="rounded-lg p-3 mb-4 border"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--bg-border)",
        }}
      >
        <p
          className="text-[12px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {documentTitle}
        </p>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Version {documentVersion}
        </p>
      </div>
      <div>
        <label
          htmlFor="sign-doc-pw"
          className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Confirm your password *
        </label>
        <input
          id="sign-doc-pw"
          type="password"
          className="input text-[12px]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Re-enter your password"
          disabled={busy}
          autoComplete="current-password"
        />
        <p
          className="text-[10px] mt-1"
          style={{ color: "var(--text-muted)" }}
        >
          Required for identity verification under 21 CFR Part 11
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="text-[11px] mt-2"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={ShieldCheck}
          disabled={busy || !password}
          loading={busy}
          onClick={handleConfirm}
        >
          Sign &amp; Approve
        </Button>
      </div>
    </Modal>
  );
}
