import { redirect } from "react-router";
import { store } from "@/store";
import { ROLE_NAV } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";

export function makeRoleLoader(path: string) {
  return function roleLoader() {
    const { token, user, activeSiteId } = store.getState().auth;
    if (!token || !user) return redirect("/login");
    if (!activeSiteId) return redirect("/site-picker");

    const allowed = ROLE_NAV[(user.role as UserRole)] ?? ["/"];
    if (!allowed.includes(path)) return redirect("/");

    return null;
  };
}
