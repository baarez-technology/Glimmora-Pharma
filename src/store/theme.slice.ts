import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type Theme = "dark" | "light";

export type ColorTheme =
  | "sky-blue"
  | "ocean-blue"
  | "teal"
  | "emerald"
  | "forest-green"
  | "indigo-navy"
  | "royal-purple"
  | "rose-pink"
  | "crimson-red"
  | "orange"
  | "amber-gold"
  | "coffee-brown"
  | "terracotta"
  | "slate-gray";

function getInitialTheme(): Theme {
  try {
    return (localStorage.getItem("glimmora-theme") as Theme) ?? "dark";
  } catch {
    return "dark";
  }
}

function getInitialColorTheme(): ColorTheme {
  try {
    return (
      (localStorage.getItem("glimmora-color-theme") as ColorTheme) ?? "amber-gold"
    );
  } catch {
    return "sky-blue";
  }
}

const themeSlice = createSlice({
  name: "theme",
  initialState: {
    mode: getInitialTheme(),
    colorTheme: getInitialColorTheme(),
  } as { mode: Theme; colorTheme: ColorTheme },
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === "dark" ? "light" : "dark";
    },
    setTheme(state, { payload }: PayloadAction<Theme>) {
      state.mode = payload;
    },
    setColorTheme(state, { payload }: PayloadAction<ColorTheme>) {
      state.colorTheme = payload;
    },
  },
});

export const { toggleTheme, setTheme, setColorTheme } = themeSlice.actions;
export default themeSlice.reducer;
