export const CHART_COLORS = {
  brand: "#a57865",
  success: "#4a5e3a",
  warning: "#c9a84c",
  danger: "#c0392b",
  info: "#4a8fa8",
  muted: "#8e7065",
  chart1: "#a57865",
  chart2: "#4a5e3a",
  chart3: "#4a8fa8",
  chart4: "#c9a84c",
  chart5: "#d4b5a0",
  chart6: "#6e4c3e",
  chart7: "#7a9e6e",
  chart8: "#c0392b",
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
