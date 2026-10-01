/**
 * Typed client for the Deviation domain.
 *
 * This is the ONLY place the browser talks to the Deviation service. Components
 * import from here; they never construct a URL or call fetch. Two reasons, both
 * load-bearing:
 *
 *  1. Credentials. Every call goes through the BFF (app/api/deviation/[...path]),
 *     which mints the service token. The browser holds no service credential and
 *     cannot assert its own identity.
 *  2. Contract drift. A change to the service's contract should break the build
 *     here, in one file, rather than surface as an undefined field in a component
 *     at runtime.
 *
 * Errors: the service returns a stable `code` next to a human message, and this
 * client preserves both. Callers branch on `code` and show `message`. A generic
 * transport failure is normalised to `NETWORK` so a caller never has to handle an
 * exception and a response separately.
 *
 * `status` is absent from every write payload BY DESIGN. The service sets it
 * server-side only; sending one is a client bug and the service rejects it.
 */

const BASE = "/api/deviation";

export type DeviationStatus =
  | "open"
  | "under_investigation"
  | "pending_qa_review"
  | "capa_pending"
  | "closed"
  | "rejected";

export type Deviation = {
  id: string;
  reference: string | null;
  tenantId: string;
  siteId: string | null;
  title: string;
  description: string;
  type: string;
  category: string;
  severity: string;
  priority: string | null;
  area: string;
  detectedBy: string;
  detectedDate: string;
  owner: string;
  dueDate: string | null;
  status: DeviationStatus;
  immediateAction: string | null;
  rootCause: string | null;
  rcaMethod: string | null;
  investigationCompletedAt: string | null;
  patientSafetyImpact: string | null;
  productQualityImpact: string | null;
  regulatoryImpact: string | null;
  batchesAffected: string | null;
  linkedCAPAId: string | null;
  closedBy: string | null;
  closedDate: string | null;
  closureNotes: string | null;
  closureSignatureId: string | null;
  capaDecisionMade: boolean;
  capaDecisionRequired: boolean | null;
  capaDecisionAt: string | null;
  createdBy: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SodOverrideOutcome = {
  control: string;
  reasonCode: string;
  justification: string;
};

export type CloseDeviationResult = {
  deviation: Deviation;
  signedRecordId: string;
  contentHash: string;
  waivedControls: SodOverrideOutcome[];
};

/** A business refusal. `code` is stable; `message` is for the user. */
export class DeviationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DeviationApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the request was well-formed and authorised, but the record is not
   *  in a state that permits the operation. The UI shows these as guidance, not as
   *  errors - "not ready to close" is not a failure of the user. */
  get isBusinessRefusal(): boolean {
    return this.status === 409;
  }
}

type ProblemBody = { code?: string; message?: string; detail?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new DeviationApiError(0, "NETWORK", "Could not reach the Deviation service.");
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    // The service's DomainError puts {code, message} in `detail`; the BFF's own
    // refusals put {error}. Both are read here so a caller always gets a code.
    const parsed = (body ?? {}) as ProblemBody & { error?: string };
    const inner =
      parsed.detail && typeof parsed.detail === "object"
        ? (parsed.detail as ProblemBody)
        : parsed;
    const code = inner.code ?? parsed.error ?? `HTTP_${res.status}`;
    const message = inner.message ?? parsed.error ?? "Request failed.";
    throw new DeviationApiError(res.status, code, message);
  }

  return body as T;
}

export function listDeviations(params?: {
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ deviations: Deviation[]; count: number }> {
  const q = new URLSearchParams();
  if (params?.includeDeleted) q.set("include_deleted", "true");
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const suffix = q.toString() ? `?${q}` : "";
  return request(`/deviations${suffix}`);
}

export function getDeviation(id: string): Promise<Deviation> {
  return request(`/deviations/${encodeURIComponent(id)}`);
}

export function startInvestigation(id: string): Promise<Deviation> {
  return request(`/deviations/${encodeURIComponent(id)}/investigation`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type CloseDeviationInput = {
  notes?: string | null;
  signatureMeaning?: string;
  /** §11.200(a)(1)(ii). Required by the service on every closure. */
  signingPassword: string;
  sodOverrideReasonCode?: string;
  sodOverrideJustification?: string;
};

export function closeDeviation(
  id: string,
  input: CloseDeviationInput,
): Promise<CloseDeviationResult> {
  return request(`/deviations/${encodeURIComponent(id)}/close`, {
    method: "POST",
    // `status` is intentionally not part of this payload. See the module docstring.
    body: JSON.stringify({
      notes: input.notes ?? null,
      signature_meaning: input.signatureMeaning ?? "Closed",
      signing_password: input.signingPassword,
      sod_override_reason_code: input.sodOverrideReasonCode ?? null,
      sod_override_justification: input.sodOverrideJustification ?? null,
    }),
  });
}

export function rejectDeviation(id: string, reason: string): Promise<Deviation> {
  return request(`/deviations/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, signature_meaning: "Rejected" }),
  });
}
