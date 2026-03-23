import { useAppSelector } from "./useAppSelector";

export function useActiveSite() {
  const activeSiteId = useAppSelector((s) => s.auth.activeSiteId);
  const sites = useAppSelector((s) => s.settings.sites);
  return activeSiteId ? sites.find((s) => s.id === activeSiteId) ?? null : null;
}
