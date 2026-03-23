import { Sun, Moon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleTheme } from "@/store/theme.slice";

export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);

  const handleToggle = () => {
    dispatch(toggleTheme());
    const next = mode === "dark" ? "light" : "dark";
    localStorage.setItem("glimmora-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={
        mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      aria-pressed={mode === "light"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
        background: "var(--bg-elevated)",
        border: "1px solid var(--bg-border)",
        color: "var(--text-secondary)",
      }}
    >
      {mode === "dark" ? (
        <>
          <Sun size={13} aria-hidden="true" /> Light
        </>
      ) : (
        <>
          <Moon size={13} aria-hidden="true" /> Dark
        </>
      )}
    </button>
  );
}
