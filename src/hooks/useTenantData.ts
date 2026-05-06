import { useMemo } from "react";
import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";

export function useTenantData() {
  const tenantId = useAppSelector((s) => s.auth.currentTenant);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { sites: accessibleSites } = useTenantConfig();

  // Memoize accessibleSiteIds to prevent recalculation
  const accessibleSiteIds = useMemo(() => accessibleSites.map((s) => s.id), [accessibleSites]);

  // Get raw data from store
  const rawFindings = useAppSelector((s) => s.findings?.items ?? []);
  const rawCapas = useAppSelector((s) => s.capa?.items ?? []);
  const rawSystems = useAppSelector((s) => s.systems?.items ?? []);
  const rawRoadmap = useAppSelector((s) => s.systems?.roadmap ?? []);
  const rawFda483 = useAppSelector((s) => s.fda483?.items ?? []);
  const rawDeviations = useAppSelector((s) => s.deviation?.items ?? []);
  const rawEvidenceDocs = useAppSelector((s) => s.evidence?.documents ?? []);
  const rawEvidencePacks = useAppSelector((s) => s.evidence?.packs ?? []);
  const rawRaidItems = useAppSelector((s) => s.raid?.items ?? []);
  const rawDriftAlerts = useAppSelector((s) => s.agiDrift?.alerts ?? []);
  const driftMetrics = useAppSelector((s) => s.agiDrift?.metrics ?? []);

  // Memoize filtered results
  const findings = useMemo(
    () =>
      rawFindings.filter((f) => {
        if (f.tenantId && f.tenantId !== tenantId) return false;
        if (f.siteId && !accessibleSiteIds.includes(f.siteId)) return false;
        if (selectedSiteId && f.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawFindings, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const capas = useMemo(
    () =>
      rawCapas.filter((c) => {
        if (c.tenantId && c.tenantId !== tenantId) return false;
        if (c.siteId && !accessibleSiteIds.includes(c.siteId)) return false;
        if (selectedSiteId && c.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawCapas, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const systems = useMemo(
    () =>
      rawSystems.filter((sys) => {
        if (sys.tenantId && sys.tenantId !== tenantId) return false;
        if (sys.siteId && !accessibleSiteIds.includes(sys.siteId)) return false;
        if (selectedSiteId && sys.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawSystems, tenantId, accessibleSiteIds, selectedSiteId],
  );

  // Roadmap: filter via system's siteId
  const systemIds = useMemo(() => new Set(systems.map((s) => s.id)), [systems]);
  const roadmap = useMemo(
    () =>
      rawRoadmap.filter((r) => {
        if (r.tenantId && r.tenantId !== tenantId) return false;
        if (selectedSiteId && r.systemId && !systemIds.has(r.systemId)) return false;
        return true;
      }),
    [rawRoadmap, tenantId, selectedSiteId, systemIds],
  );

  const fda483Events = useMemo(
    () =>
      rawFda483.filter((e) => {
        if (e.tenantId && e.tenantId !== tenantId) return false;
        if (e.siteId && !accessibleSiteIds.includes(e.siteId)) return false;
        if (selectedSiteId && e.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawFda483, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const deviations = useMemo(
    () =>
      rawDeviations.filter((d) => {
        if (d.tenantId && d.tenantId !== tenantId) return false;
        if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
        if (selectedSiteId && d.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawDeviations, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const evidenceDocs = useMemo(
    () =>
      rawEvidenceDocs.filter((d) => {
        if (d.tenantId && d.tenantId !== tenantId) return false;
        if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
        if (selectedSiteId && d.siteId && d.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawEvidenceDocs, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const evidencePacks = useMemo(
    () => rawEvidencePacks.filter((p) => !p.tenantId || p.tenantId === tenantId),
    [rawEvidencePacks, tenantId],
  );

  const raidItems = useMemo(
    () =>
      rawRaidItems.filter((r) => {
        if (r.tenantId && r.tenantId !== tenantId) return false;
        if (r.siteId && !accessibleSiteIds.includes(r.siteId)) return false;
        if (selectedSiteId && r.siteId !== selectedSiteId) return false;
        return true;
      }),
    [rawRaidItems, tenantId, accessibleSiteIds, selectedSiteId],
  );

  const driftAlerts = useMemo(
    () => rawDriftAlerts.filter((a) => !a.tenantId || a.tenantId === tenantId),
    [rawDriftAlerts, tenantId],
  );

  return {
    tenantId: tenantId ?? "",
    findings,
    capas,
    systems,
    roadmap,
    fda483Events,
    deviations,
    evidenceDocs,
    evidencePacks,
    raidItems,
    driftAlerts,
    driftMetrics,
  };
}
