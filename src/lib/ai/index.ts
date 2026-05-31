/**
 * AI feature gateway. Mocks now; real backend later
 * (OpenAI / Anthropic / existing Python service).
 *
 * When wiring real backend:
 *   1. Set MOCK_AI_RESPONSES = false
 *   2. Implement the real fetch in each function below
 *   3. The function signatures and return shapes MUST
 *      remain identical
 *
 * The mocks intentionally produce deterministic,
 * observation-aware data so demos feel responsive
 * without being random.
 */

import {
  mockRcaSuggestions,
  mockCapaPrefill,
  mockResponseDraft,
} from "./mockData";

export const MOCK_AI_RESPONSES = true;

function logMockUsage(featureName: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[mock-ai] ${featureName} served from mock. ` +
        `Set MOCK_AI_RESPONSES=false to use real backend.`,
    );
  }
}

/** Small latency shim so the demo's loading states are actually visible. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Feature A — RCA suggestions (method-shaped) ─────────────────── */

export type RcaMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Barrier Analysis";

/** 5 Why: 5 progressive Why answers leading to root cause. */
export interface FiveWhySuggestion {
  method: "5 Why";
  whys: [string, string, string, string, string]; // exactly 5 entries
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

/** Fishbone: 6 category candidates + root cause. */
export interface FishboneSuggestion {
  method: "Fishbone";
  categories: {
    people: string;
    process: string;
    equipment: string;
    materials: string;
    environment: string;
    management: string;
  };
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

/** Fault Tree + Barrier Analysis: freeform root cause only. */
export interface FreeformSuggestion {
  method: "Fault Tree" | "Barrier Analysis";
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

export type RcaSuggestion =
  | FiveWhySuggestion
  | FishboneSuggestion
  | FreeformSuggestion;

export async function getRcaSuggestions(
  method: RcaMethod,
  observationText: string,
  observationSeverity: string,
  siteContext: string,
): Promise<RcaSuggestion[]> {
  if (MOCK_AI_RESPONSES) {
    logMockUsage("getRcaSuggestions");
    // Modest latency so the LOADING panel state is demoable.
    await delay(750);
    return mockRcaSuggestions(method, observationText);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void [method, observationText, observationSeverity, siteContext];
  throw new Error("Real AI not yet wired");
}

/* ── Feature B — CAPA pre-fill ───────────────────────────────────── */

export interface CAPAPrefill {
  title: string;
  description: string;
  suggestedOwnerHint: string;
  suggestedDueDate: string; // ISO date
  reasoning: string;
}

export async function getCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): Promise<CAPAPrefill> {
  if (MOCK_AI_RESPONSES) {
    logMockUsage("getCapaPrefill");
    await delay(600);
    return mockCapaPrefill(observationText, rcaRootCause, observationSeverity);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void [observationText, rcaRootCause, observationSeverity];
  throw new Error("Real AI not yet wired");
}

/* ── Feature C — Response draft ──────────────────────────────────── */

export interface ResponseDraftObservation {
  number: number;
  text: string;
  severity: string;
  rootCause: string | null;
  capaRef: string | null;
}

export interface ResponseDraftEvent {
  reference: string;
  agency: string;
  site: string;
  inspectionDate: string;
  observations: ResponseDraftObservation[];
}

export async function getResponseDraft(
  event: ResponseDraftEvent,
): Promise<{ draft: string; characterCount: number }> {
  if (MOCK_AI_RESPONSES) {
    logMockUsage("getResponseDraft");
    // Artificial 1.5s delay mirrors real LLM latency (~1-3s).
    // Remove when real backend wires up.
    await delay(1500);
    return mockResponseDraft(event);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void event;
  throw new Error("Real AI not yet wired");
}
