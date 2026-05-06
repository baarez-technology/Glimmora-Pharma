"use client";

import { ReadinessPage } from "@/modules/readiness/ReadinessPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Training & Awareness">
      <ReadinessPage />
    </ErrorBoundary>
  );
}
