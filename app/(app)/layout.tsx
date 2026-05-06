"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDataLoader } from "@/hooks/useDataLoader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Load all data from database on app initialization
  useDataLoader();

  return <AppShell>{children}</AppShell>;
}
