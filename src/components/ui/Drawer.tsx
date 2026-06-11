"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Right-side slide-over panel. API naming mirrors Modal.tsx
 * (open / onClose / title / footer / persistent) so the two feel consistent;
 * the page behind stays visible (dimmed). Reuses Modal's focus + Escape +
 * body-scroll-lock handling rather than reinventing it (Modal uses no portal —
 * an inline `fixed inset-0` overlay — so this mirrors that).
 *
 * Slide-in uses a transform transition (there is no slide keyframe in
 * index.css): the panel mounts at translate-x-full and flips to 0 on the next
 * frame. Like Modal, there is no exit animation — it unmounts on close.
 */
type DrawerWidth = "md" | "lg";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sticky footer region (e.g. Cancel / Save), outside the scrollable body. */
  footer?: ReactNode;
  width?: DrawerWidth;
  /** When true, clicking the backdrop (and Escape) does NOT close — for
   *  unsaved-form safety. Mirrors Modal's `persistent`. */
  persistent?: boolean;
}

const WIDTHS: Record<DrawerWidth, string> = {
  md: "max-w-[480px]",
  lg: "max-w-[640px]",
};

export function Drawer({ open, onClose, title, children, footer, width = "md", persistent }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Drives the slide-in: render off-screen (translate-x-full), then flip to 0.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Next frame so the transition runs from the off-screen start position.
      const raf = requestAnimationFrame(() => {
        setShown(true);
        panelRef.current?.focus();
      });
      return () => {
        cancelAnimationFrame(raf);
        document.body.style.overflow = prev;
        setShown(false);
      };
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !persistent) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // `persistent` is read inside the closure; no need to re-bind on flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={persistent ? undefined : onClose}>
      <div
        className={clsx(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative h-full w-full flex flex-col border-l shadow-2xl",
          "bg-(--bg-elevated) border-(--bg-border)",
          "transition-transform duration-200 ease-out will-change-transform",
          "focus:outline-none",
          WIDTHS[width],
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
          <h2 id="drawer-title" className="text-[14px] font-semibold text-(--text-primary)">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-(--bg-border) bg-(--bg-elevated)">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
