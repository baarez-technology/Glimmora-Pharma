import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { store } from "@/store";
import { router } from "@/router";
import "./index.css";

const savedTheme = (() => {
  try {
    return localStorage.getItem("glimmora-theme") ?? "light";
  } catch {
    return "light";
  }
})();
document.documentElement.setAttribute("data-theme", savedTheme);

const savedColorTheme = (() => {
  try {
    return localStorage.getItem("glimmora-color-theme") ?? "coffee-brown";
  } catch {
    return "coffee-brown";
  }
})();
document.documentElement.setAttribute("data-color-theme", savedColorTheme);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
