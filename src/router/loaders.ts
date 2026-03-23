import { redirect } from "react-router";
import { store } from "@/store";

export function authLoader() {
  const { token } = store.getState().auth;
  if (!token) return redirect("/login");
  return null;
}

export function siteLoader() {
  const { token, activeSiteId } = store.getState().auth;
  if (!token) return redirect("/login");
  if (!activeSiteId) return redirect("/site-picker");
  return null;
}
