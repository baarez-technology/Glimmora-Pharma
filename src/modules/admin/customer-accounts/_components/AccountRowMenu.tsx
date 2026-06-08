"use client";

import { MoreVertical, Eye, Pencil, PauseCircle, PlayCircle } from "lucide-react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { type Tenant } from "@/store/auth.slice";

/**
 * Per-row overflow (⋮) menu — View / Edit / Suspend (Reactivate when already
 * suspended). NO hard-delete action: this product is soft-delete only, and
 * Suspend is the destructive-ish action (routed through a confirmation by the
 * parent). The wrapper stops click propagation so opening the menu does not
 * also trigger the row's navigation.
 */
interface AccountRowMenuProps {
  tenant: Tenant;
  onView: (tenant: Tenant) => void;
  onEdit: (tenant: Tenant) => void;
  /** Parent decides suspend-vs-reactivate from tenant.active. */
  onSuspend: (tenant: Tenant) => void;
}

export function AccountRowMenu({ tenant, onView, onEdit, onSuspend }: AccountRowMenuProps) {
  const suspended = tenant.active === false;
  const options: DropdownOption[] = [
    { value: "view", label: "View", icon: Eye, onClick: () => onView(tenant) },
    { value: "edit", label: "Edit", icon: Pencil, onClick: () => onEdit(tenant) },
    suspended
      ? { value: "reactivate", label: "Reactivate", icon: PlayCircle, onClick: () => onSuspend(tenant) }
      : { value: "suspend", label: "Suspend", icon: PauseCircle, danger: true, onClick: () => onSuspend(tenant) },
  ];

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dropdown
        actionMode
        hideCaret
        options={options}
        width="w-auto"
        menuWidth="w-44"
        triggerLabel={
          <>
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Actions for {tenant.name}</span>
          </>
        }
      />
    </div>
  );
}
