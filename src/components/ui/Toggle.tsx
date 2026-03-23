interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id: string;
}

export function Toggle({ checked, onChange, label, description, id }: ToggleProps) {
  const labelId = `${id}-label`;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        id={id} 
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        className={`toggle-track ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
      <div>
        <span id={labelId} className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        {description && (
          <p id={descId} className="text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
