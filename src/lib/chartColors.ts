export const CHART_COLORS = {
  brand: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#6366f1",
  muted: "#475569",
};

export const chartDefaults = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "var(--chart-grid)" },
  xAxis: {
    tick: { fill: "var(--chart-tick)", fontSize: 11 },
    axisLine: false,
    tickLine: false,
  },
  yAxis: {
    tick: { fill: "var(--chart-tick)", fontSize: 11 },
    axisLine: false,
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      background: "var(--bg-elevated)",
      border: "1px solid var(--bg-border)",
      borderRadius: 8,
      color: "var(--text-primary)",
      fontSize: 12,
    },
  },
};
