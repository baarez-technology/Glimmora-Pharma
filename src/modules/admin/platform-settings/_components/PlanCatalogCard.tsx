import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PLAN_TIERS, TAILORED_CEILINGS } from "@/lib/plans";

/**
 * Read-only catalog of the plan tiers. Values are pulled from
 * PLAN_TIERS / TAILORED_CEILINGS (src/lib/plans.ts) — not hardcoded — because
 * caps are frozen onto each tenant's plan at assignment time and cannot be
 * edited here.
 */
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function PlanCatalogCard() {
  const fixedRows = (Object.keys(PLAN_TIERS) as Array<keyof typeof PLAN_TIERS>).map((k) => ({
    tier: titleCase(k),
    ...PLAN_TIERS[k],
    ceiling: false,
  }));
  const rows = [
    ...fixedRows,
    {
      tier: "Tailored",
      maxUsers: TAILORED_CEILINGS.maxUsers,
      maxSites: TAILORED_CEILINGS.maxSites,
      minRetentionYears: TAILORED_CEILINGS.minRetentionYears,
      ceiling: true,
    },
  ];

  return (
    <Card
      padding="none"
      header={
        <>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Plan Catalog</span>
          </div>
          <Badge variant="gray">Fixed tiers — read-only</Badge>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="data-table" aria-label="Plan catalog">
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Max Users</th>
              <th scope="col">Max Sites</th>
              <th scope="col">Min Retention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tier}>
                <td>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{r.tier}</span>
                  {r.ceiling && (
                    <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>(ceiling — caps configurable up to these)</span>
                  )}
                </td>
                <td>{r.maxUsers}</td>
                <td>{r.maxSites}</td>
                <td>{r.minRetentionYears} yr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] px-5 py-3" style={{ color: "var(--text-muted)" }}>
        Caps are frozen onto each tenant&apos;s plan at assignment — these tier values come from <span className="font-mono">src/lib/plans.ts</span> and are not editable here.
      </p>
    </Card>
  );
}
