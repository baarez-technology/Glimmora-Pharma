"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string, duration?: number) => string;
  dismiss: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const PALETTE: Record<ToastKind, { bg: string; border: string; text: string; Icon: typeof CheckCircle }> = {
  success: { bg: "#d1fae5", border: "#10b981", text: "#065f46", Icon: CheckCircle },
  error:   { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", Icon: AlertCircle },
  info:    { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", Icon: Info },
};

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Tracks the setTimeout handles per-toast so dismiss() can clear them and
  // toasts that are dismissed early don't leak timers.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timersRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback((kind: ToastKind, message: string, duration = DEFAULT_DURATION_MS) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, kind, message, duration }]);
    if (duration > 0) {
      const handle = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, handle);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    // Snapshot the ref's current value so the cleanup doesn't read a stale
    // ref.current after the component unmounts.
    const timers = timersRef.current;
    return () => {
      timers.forEach((h) => clearTimeout(h));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    show,
    dismiss,
    success: (m, d) => show("success", m, d),
    error:   (m, d) => show("error",   m, d),
    info:    (m, d) => show("info",    m, d),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider> (mounted in Providers.tsx).");
  }
  return ctx;
}

/* ── Viewport: stacked fixed bottom-right ───────────────────────── */

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const palette = PALETTE[toast.kind];
  const Icon = palette.Icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg min-w-[260px] max-w-[380px] animate-in slide-in-from-right-4 duration-200"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 text-[12px] font-medium leading-snug">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 -mr-1 -mt-0.5 p-1 rounded hover:bg-black/5 transition-colors border-none bg-transparent cursor-pointer"
        style={{ color: palette.text }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
