import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  try {
    return (localStorage.getItem("glimmora-theme") as Theme) ?? "dark";
  } catch {
    return "dark";
  }
}

const themeSlice = createSlice({
  name: "theme",
  initialState: { mode: getInitialTheme() } as { mode: Theme },
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === "dark" ? "light" : "dark";
    },
    setTheme(state, { payload }: PayloadAction<Theme>) {
      state.mode = payload;
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;
export default themeSlice.reducer;
