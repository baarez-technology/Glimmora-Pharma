import { useAppSelector } from "./useAppSelector";

export type UserRole =
  | "super_admin"
  | "qa_head"
  | "qc_lab_director"
  | "regulatory_affairs"
  | "csv_val_lead"
  | "it_cdo"
  | "operations_head"
  | "viewer";

export const ROLE_NAV: Record<UserRole, string[]> = {
  super_admin: [
    "/", "settings", "gap-assessment", "capa",
    "csv-csa", "inspection", "evidence",
    "fda-483", "agi-console", "governance",
  ],
  qa_head: [
    "/", "settings", "gap-assessment", "capa",
    "evidence", "fda-483", "governance",
  ],
  qc_lab_director: [
    "/", "gap-assessment", "capa", "evidence", "governance",
  ],
  regulatory_affairs: [
    "/", "gap-assessment", "capa", "evidence",
    "fda-483", "governance",
  ],
  csv_val_lead: [
    "/", "gap-assessment", "capa", "csv-csa",
    "inspection", "evidence", "governance",
  ],
  it_cdo: [
    "/", "settings", "agi-console",
  ],
  operations_head: [
    "/", "inspection", "governance",
  ],
  viewer: [
    "/", "governance",
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  qa_head: "QA Head",
  qc_lab_director: "QC/Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  csv_val_lead: "CSV/Val Lead",
  it_cdo: "IT/CDO",
  operations_head: "Operations Head",
  viewer: "Viewer",
};

export function useRole() {
  const user = useAppSelector((s) => s.auth.user);
  const role = (user?.role ?? "viewer") as UserRole;
  const allowedPaths = ROLE_NAV[role] ?? ["/"];

  return {
    role,
    canSign: user?.gxpSignatory === true,
    canCloseCapa: role === "qa_head" || role === "super_admin",
    canApproveDocs: user?.gxpSignatory === true,
    canEditSettings: role === "super_admin",
    canViewAGI: role === "it_cdo" || role === "super_admin",
    canView483: ["regulatory_affairs", "qa_head", "super_admin"].includes(role),
    isViewOnly: role === "viewer",
    allowedPaths,
    canAccess: (path: string) => allowedPaths.includes(path),
  };
}
