// Keyword-based mock — apparent intelligence in demos.
// Replaced by real LLM when MOCK_AI_RESPONSES=false.
// Pool selection deterministic; same input -> same output.

import type {
  RcaMethod,
  RcaSuggestion,
  FiveWhySuggestion,
  FishboneSuggestion,
  FreeformSuggestion,
  CAPAPrefill,
  ResponseDraftEvent,
} from "./index";

/** Raw material for synthesizing method-shaped output. The 5-Why chain uses
 *  proximal/contributing/systemic; the Fishbone uses the 6 category keys. */
interface RcaFactors {
  proximal: string;
  contributing: string;
  systemic: string;
  process: string;
  people: string;
  equipment: string;
  materials: string;
  environment: string;
  management: string;
}

interface PoolEntry {
  rootCause: string;
  factors: RcaFactors;
  confidence: number;
  supportingFindings: { ref: string; similarity: number }[];
}

interface RcaPool {
  name: string;
  keywords: string[];
  suggestions: PoolEntry[];
}

const POOL_DOCUMENTATION: RcaPool = {
  name: "POOL_DOCUMENTATION",
  keywords: [
    "batch record",
    "sop",
    "procedure",
    "documentation",
    "deviation",
    "batch",
    "record-keeping",
  ],
  suggestions: [
    {
      rootCause:
        "The governing standard operating procedure lacked sufficient detail to ensure consistent execution, permitting procedural drift during routine operations.",
      factors: {
        proximal: "An operator made a judgment call on a step the SOP left ambiguous.",
        contributing: "The SOP did not specify acceptance criteria or numeric thresholds for the step.",
        systemic: "The periodic procedure-review cycle does not test SOPs against real edge cases.",
        process: "Document-control review did not catch the ambiguity before issue.",
        people: "Staff were trained to the SOP as written, so the gap propagated into practice.",
        equipment: "No system prompt or interlock enforced the intended sequence.",
        materials: "Batch paperwork templates mirrored the same ambiguous wording.",
        environment: "Shift handovers relied on verbal clarification of the ambiguous step.",
        management: "Tier-1 review treated the SOP as authoritative and did not question it.",
      },
      confidence: 78,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-027", similarity: 0.84 },
        { ref: "CAPA-BLR-2024-103", similarity: 0.71 },
      ],
    },
    {
      rootCause:
        "Affected personnel were not trained on the current revision of the SOP before performing the task, creating a procedure-vs-practice gap.",
      factors: {
        proximal: "The task was performed against a superseded revision of the SOP.",
        contributing: "The revised SOP was released without a read-and-understand gate.",
        systemic: "Training assignment is not automatically triggered by a document revision.",
        process: "Change control closed before training records were verified.",
        people: "Operators were unaware a newer revision existed.",
        equipment: "The document portal still surfaced the old revision in search.",
        materials: "Printed copies of the prior revision remained at the workstation.",
        environment: "High turnover left several operators on legacy training.",
        management: "Supervisors did not reconcile the training matrix after the revision.",
      },
      confidence: 66,
      supportingFindings: [{ ref: "CAPA-CHN-2024-112", similarity: 0.69 }],
    },
    {
      rootCause:
        "Record-keeping discipline was not enforced at the point of execution, allowing contemporaneous entries to be deferred or reconstructed.",
      factors: {
        proximal: "Entries were completed after the fact rather than contemporaneously.",
        contributing: "The procedure did not require recording at the point of execution.",
        systemic: "There is no in-line check that records are made in real time.",
        process: "Record review happened only at batch close, too late to catch deferral.",
        people: "Operators prioritized throughput over contemporaneous recording.",
        equipment: "Paper logs were located away from the point of operation.",
        materials: "Logbook design allowed retrospective completion.",
        environment: "Workstation layout discouraged on-the-spot documentation.",
        management: "Supervisory checks did not verify the timing of entries.",
      },
      confidence: 54,
      supportingFindings: [{ ref: "CAPA-BLR-2023-061", similarity: 0.58 }],
    },
  ],
};

const POOL_EQUIPMENT: RcaPool = {
  name: "POOL_EQUIPMENT",
  keywords: [
    "equipment",
    "qualification",
    "hplc",
    "instrument",
    "calibration",
    "machine",
    "gc",
    "balance",
    "autoclave",
  ],
  suggestions: [
    {
      rootCause:
        "The equipment requalification interval was not aligned with usage frequency, allowing operation beyond the validated qualification window.",
      factors: {
        proximal: "The instrument was used beyond its validated qualification window.",
        contributing: "Requalification was scheduled by calendar rather than by usage.",
        systemic: "Qualification intervals are not risk- or usage-based.",
        process: "The qualification schedule was not reconciled with utilization data.",
        people: "Operators were not aware of the qualification expiry status.",
        equipment: "The instrument had no usage counter tied to requalification.",
        materials: "Reference standards used in qualification were near expiry.",
        environment: "The instrument was relocated without re-verifying qualification.",
        management: "Engineering review did not flag the overdue requalification.",
      },
      confidence: 81,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-044", similarity: 0.86 },
        { ref: "CAPA-CHN-2024-077", similarity: 0.72 },
      ],
    },
    {
      rootCause:
        "The instrument calibration program did not define adequate acceptance criteria for the operating range actually in use.",
      factors: {
        proximal: "A reading near the range edge passed loose acceptance criteria.",
        contributing: "Calibration criteria did not cover the actual operating range.",
        systemic: "Calibration program design is not tied to method operating ranges.",
        process: "Calibration procedure review did not include method requirements.",
        people: "Metrology staff applied generic criteria, not method-specific ones.",
        equipment: "The instrument's precision at range edges was not characterized.",
        materials: "Calibration standards did not bracket the operating range.",
        environment: "Ambient conditions during calibration differed from use.",
        management: "Calibration program ownership did not include method input.",
      },
      confidence: 69,
      supportingFindings: [{ ref: "CAPA-BLR-2024-031", similarity: 0.74 }],
    },
    {
      rootCause:
        "Preventive maintenance scheduling gaps allowed wear-related drift to go undetected between service intervals.",
      factors: {
        proximal: "Wear-related drift went undetected between service visits.",
        contributing: "Preventive maintenance intervals were too long for the duty cycle.",
        systemic: "PM frequency is not derived from reliability or failure data.",
        process: "PM completion was tracked but effectiveness was not trended.",
        people: "Technicians lacked guidance on early wear indicators.",
        equipment: "No condition monitoring was fitted to the asset.",
        materials: "Service kits used did not include all wear parts.",
        environment: "The duty environment accelerated wear beyond assumptions.",
        management: "Maintenance planning did not review PM adequacy.",
      },
      confidence: 52,
      supportingFindings: [{ ref: "CAPA-CHN-2023-090", similarity: 0.61 }],
    },
  ],
};

const POOL_TRAINING: RcaPool = {
  name: "POOL_TRAINING",
  keywords: [
    "training",
    "operator",
    "personnel",
    "staff",
    "awareness",
    "qualification of personnel",
  ],
  suggestions: [
    {
      rootCause:
        "The training program did not cover the specific task under the current procedure revision, leaving a competency gap for assigned operators.",
      factors: {
        proximal: "The operator performed a task they were not trained on for the current revision.",
        contributing: "Training content lagged the latest procedure revision.",
        systemic: "Curriculum updates are not linked to procedure changes.",
        process: "A training-needs analysis was not repeated after the revision.",
        people: "Assigned operators lacked the specific competency.",
        equipment: "The training LMS did not flag the curriculum gap.",
        materials: "Training materials referenced an older workflow.",
        environment: "On-the-job coaching filled the gap inconsistently.",
        management: "The training matrix was not reviewed against the revision.",
      },
      confidence: 77,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-019", similarity: 0.82 },
        { ref: "CAPA-BLR-2024-058", similarity: 0.7 },
      ],
    },
    {
      rootCause:
        "Refresher training cadence was insufficient to maintain proficiency for an infrequently performed activity.",
      factors: {
        proximal: "Proficiency had decayed since the task was last performed.",
        contributing: "No refresher was scheduled for the low-frequency activity.",
        systemic: "Refresher cadence is uniform and ignores task frequency.",
        process: "Competency decay is not modeled in the training plan.",
        people: "The operator had not performed the task in many months.",
        equipment: "No simulation or practice rig maintained the skill.",
        materials: "Job aids for the rare task were outdated.",
        environment: "The task occurred under time pressure without support.",
        management: "Supervisors did not require re-verification before the rare task.",
      },
      confidence: 63,
      supportingFindings: [{ ref: "CAPA-CHN-2024-101", similarity: 0.67 }],
    },
    {
      rootCause:
        "Role-specific competency assessment was not completed before independent execution of the task was authorized.",
      factors: {
        proximal: "The operator worked independently before sign-off.",
        contributing: "Competency assessment was skipped under staffing pressure.",
        systemic: "Independent-work authorization is not gated on assessment.",
        process: "The qualification workflow lacked a hard stop.",
        people: "The trainee was deemed ready informally.",
        equipment: "The LMS allowed task assignment without an assessment status.",
        materials: "Assessment checklists were not used.",
        environment: "Short-staffing pushed the trainee onto the line early.",
        management: "Supervisory sign-off was treated as a formality.",
      },
      confidence: 49,
      supportingFindings: [{ ref: "CAPA-BLR-2023-077", similarity: 0.55 }],
    },
  ],
};

const POOL_ENVIRONMENTAL: RcaPool = {
  name: "POOL_ENVIRONMENTAL",
  keywords: [
    "environmental",
    "humidity",
    "temperature",
    "monitoring",
    "em",
    "hvac",
    "room classification",
  ],
  suggestions: [
    {
      rootCause:
        "Environmental monitoring alert and action limits were not set conservatively enough to trigger timely investigation of adverse trends.",
      factors: {
        proximal: "An adverse trend crossed limits before an investigation triggered.",
        contributing: "Alert/action limits were set too loosely to give early warning.",
        systemic: "Limit-setting is not based on historical capability data.",
        process: "Trend review did not act on near-limit excursions.",
        people: "Monitoring staff treated single excursions as noise.",
        equipment: "Sensor placement missed the worst-case location.",
        materials: "Monitoring media/consumables varied in sensitivity.",
        environment: "Seasonal variation was not reflected in the limits.",
        management: "Periodic limit review was overdue.",
      },
      confidence: 79,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-033", similarity: 0.85 },
        { ref: "CAPA-CHN-2024-066", similarity: 0.73 },
      ],
    },
    {
      rootCause:
        "Monitoring frequency for the classified area did not reflect the actual risk profile of the operations performed within it.",
      factors: {
        proximal: "An event occurred between scheduled monitoring points.",
        contributing: "Monitoring frequency did not match the area's risk profile.",
        systemic: "Frequency is set uniformly rather than by risk assessment.",
        process: "The risk assessment was not revisited after process changes.",
        people: "Staff followed the schedule without questioning adequacy.",
        equipment: "Continuous monitoring was not deployed where warranted.",
        materials: "Sampling supplies limited how often monitoring could occur.",
        environment: "Higher-activity operations were under-sampled.",
        management: "QA did not reassess the monitoring plan.",
      },
      confidence: 64,
      supportingFindings: [{ ref: "CAPA-BLR-2024-040", similarity: 0.68 }],
    },
    {
      rootCause:
        "The HVAC requalification interval lapsed relative to the validated state of the room classification.",
      factors: {
        proximal: "The room operated past its HVAC requalification due date.",
        contributing: "Requalification scheduling did not track the classification's validated state.",
        systemic: "HVAC qualification intervals are not centrally tracked.",
        process: "The requalification trigger was manual and was missed.",
        people: "Facilities staff were unaware of the lapse.",
        equipment: "No alarm flagged the overdue HVAC qualification.",
        materials: "Filter change records were incomplete.",
        environment: "Room pressure cascade drifted unverified.",
        management: "Engineering review did not surface the overdue status.",
      },
      confidence: 51,
      supportingFindings: [{ ref: "CAPA-CHN-2023-052", similarity: 0.59 }],
    },
  ],
};

const POOL_DATA_INTEGRITY: RcaPool = {
  name: "POOL_DATA_INTEGRITY",
  keywords: [
    "data",
    "electronic",
    "signature",
    "audit trail",
    "computer",
    "software",
    "system",
    "csv",
    "alcoa",
    "electronic record",
  ],
  suggestions: [
    {
      rootCause:
        "Computerized system controls did not fully satisfy 21 CFR Part 11 requirements for the electronic records generated by the workflow.",
      factors: {
        proximal: "Electronic records were produced without full Part 11 controls.",
        contributing: "The system was deployed without complete 21 CFR Part 11 configuration.",
        systemic: "CSV scope did not enforce Part 11 control verification.",
        process: "Validation did not test audit-trail and e-signature controls.",
        people: "Users were not trained on the data-integrity expectations.",
        equipment: "The system lacked enforced audit-trail settings.",
        materials: "Configuration baselines did not include Part 11 settings.",
        environment: "Shared workstations enabled attributable-record gaps.",
        management: "Periodic review of system controls was not performed.",
      },
      confidence: 83,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-027", similarity: 0.88 },
        { ref: "CAPA-BLR-2024-115", similarity: 0.75 },
      ],
    },
    {
      rootCause:
        "A defined audit-trail review process was not in place to detect unauthorized or unexpected changes to critical data.",
      factors: {
        proximal: "An unexpected data change went unreviewed.",
        contributing: "No procedure defined routine audit-trail review.",
        systemic: "Audit-trail review is not built into the data lifecycle.",
        process: "Batch review did not include audit-trail examination.",
        people: "Reviewers were not trained to interrogate audit trails.",
        equipment: "Audit-trail reports were difficult to generate.",
        materials: "No risk-based review criteria existed.",
        environment: "High data volume discouraged routine review.",
        management: "QA did not mandate an audit-trail review frequency.",
      },
      confidence: 70,
      supportingFindings: [{ ref: "CAPA-CHN-2024-088", similarity: 0.72 }],
    },
    {
      rootCause:
        "User role and permission scoping allowed segregation-of-duties conflicts within the application.",
      factors: {
        proximal: "A single user could both create and approve a record.",
        contributing: "Role permissions were over-scoped at provisioning.",
        systemic: "Access management does not enforce segregation of duties.",
        process: "Periodic access review did not detect the conflict.",
        people: "Admins granted convenience access without an SoD review.",
        equipment: "The application lacked granular permission roles.",
        materials: "Role definitions were not documented per SoD requirements.",
        environment: "Small team size encouraged shared or elevated accounts.",
        management: "Access approvals did not require SoD confirmation.",
      },
      confidence: 55,
      supportingFindings: [{ ref: "CAPA-BLR-2023-099", similarity: 0.6 }],
    },
  ],
};

const POOL_CONTAMINATION: RcaPool = {
  name: "POOL_CONTAMINATION",
  keywords: [
    "cleaning",
    "contamination",
    "sterile",
    "bioburden",
    "particulate",
    "environmental control",
    "microbial",
  ],
  suggestions: [
    {
      rootCause:
        "Cleaning validation did not establish a defensible interval for the equipment train under the current product mix.",
      factors: {
        proximal: "Equipment was reused past a non-validated cleaning hold.",
        contributing: "Cleaning validation did not define a defensible hold for the product mix.",
        systemic: "Cleaning validation is not refreshed when the product mix changes.",
        process: "Campaign planning did not reference cleaning-validation limits.",
        people: "Operators followed cleaning SOPs not tied to validated intervals.",
        equipment: "Equipment design left hard-to-clean areas.",
        materials: "Worst-case product residues were not bracketed.",
        environment: "Hold times in the area exceeded validated conditions.",
        management: "Validation review did not keep pace with the product mix.",
      },
      confidence: 80,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-051", similarity: 0.87 },
        { ref: "CAPA-CHN-2024-070", similarity: 0.74 },
      ],
    },
    {
      rootCause:
        "Gowning practice and qualification did not adequately mitigate the personnel-borne contamination risk for the area grade.",
      factors: {
        proximal: "Personnel-borne contamination was introduced into the graded area.",
        contributing: "Gowning qualification did not match the area grade's risk.",
        systemic: "Gowning requirements are not tied to area classification.",
        process: "Gowning re-qualification cadence was insufficient.",
        people: "Operators' aseptic technique varied.",
        equipment: "Gowning materials did not meet the required barrier level.",
        materials: "Sterile garments were stored or handled inconsistently.",
        environment: "Airlock flows did not reinforce correct gowning.",
        management: "Aseptic-behavior monitoring was infrequent.",
      },
      confidence: 67,
      supportingFindings: [{ ref: "CAPA-BLR-2024-045", similarity: 0.69 }],
    },
    {
      rootCause:
        "Area classification controls were insufficient to maintain the required microbial state during dynamic operations.",
      factors: {
        proximal: "The microbial state degraded during dynamic operations.",
        contributing: "Classification controls were sized for static, not dynamic, conditions.",
        systemic: "Area classification is not validated against dynamic operations.",
        process: "Operational monitoring did not reflect peak activity.",
        people: "Personnel movement disrupted unidirectional flow.",
        equipment: "Air-handling capacity was marginal at peak load.",
        materials: "Material transfer practices breached the classified boundary.",
        environment: "Room recovery time was longer than assumed.",
        management: "Classification review did not consider dynamic load.",
      },
      confidence: 53,
      supportingFindings: [{ ref: "CAPA-CHN-2023-063", similarity: 0.57 }],
    },
  ],
};

const POOL_GENERIC: RcaPool = {
  name: "POOL_GENERIC",
  keywords: [],
  suggestions: [
    {
      rootCause:
        "A governing procedure did not adequately specify the controls needed to prevent the observed condition.",
      factors: {
        proximal: "The condition arose at a step the procedure left uncontrolled.",
        contributing: "The procedure did not specify a needed control.",
        systemic: "Procedure design does not consistently include control points.",
        process: "Procedure review did not assess control adequacy.",
        people: "Staff followed the procedure as written.",
        equipment: "No engineering control backstopped the gap.",
        materials: "Inputs varied without a defined control.",
        environment: "Operating conditions were not constrained.",
        management: "Review did not challenge control completeness.",
      },
      confidence: 60,
      supportingFindings: [{ ref: "CAPA-CHN-2024-100", similarity: 0.66 }],
    },
    {
      rootCause:
        "Personnel awareness and training did not fully address the requirements relevant to the observed task.",
      factors: {
        proximal: "The requirement was not applied at the point of work.",
        contributing: "Training did not cover the relevant requirement.",
        systemic: "Awareness of the requirement is not systematically reinforced.",
        process: "Onboarding did not include the requirement.",
        people: "Staff were unaware of the expectation.",
        equipment: "No reminder or prompt reinforced the requirement.",
        materials: "Job aids omitted the requirement.",
        environment: "Communication of the requirement was inconsistent.",
        management: "Supervisors did not reinforce the requirement.",
      },
      confidence: 52,
      supportingFindings: [{ ref: "CAPA-BLR-2024-072", similarity: 0.61 }],
    },
    {
      rootCause:
        "Independent verification was not performed at a step where an error could propagate undetected.",
      factors: {
        proximal: "An error propagated past a step with no second check.",
        contributing: "Independent verification was not built into the step.",
        systemic: "Verification controls are not applied to error-prone steps.",
        process: "Process design omitted a verification gate.",
        people: "A single operator executed without a checker.",
        equipment: "No system check validated the result.",
        materials: "No reconciliation step caught the discrepancy.",
        environment: "Time pressure discouraged double-checks.",
        management: "Review did not require independent verification.",
      },
      confidence: 45,
      supportingFindings: [{ ref: "CAPA-CHN-2023-085", similarity: 0.54 }],
    },
  ],
};

// Order matters: ties in keyword-match count resolve to the FIRST defined.
const POOLS: RcaPool[] = [
  POOL_DOCUMENTATION,
  POOL_EQUIPMENT,
  POOL_TRAINING,
  POOL_ENVIRONMENTAL,
  POOL_DATA_INTEGRITY,
  POOL_CONTAMINATION,
];

/** Deterministic keyword scoring → pick the best-matching pool. */
function selectRcaPool(observationText: string): RcaPool {
  const text = observationText.toLowerCase();
  let best: RcaPool | null = null;
  let bestCount = 0;
  for (const pool of POOLS) {
    const count = pool.keywords.reduce(
      (n, kw) => (text.includes(kw) ? n + 1 : n),
      0,
    );
    // Strict `>` means an earlier-defined pool wins ties.
    if (count > bestCount) {
      bestCount = count;
      best = pool;
    }
  }
  return bestCount > 0 && best ? best : POOL_GENERIC;
}

/* ── Method-shaping: one pool entry → one method-specific suggestion ── */

function shape5Why(
  entry: PoolEntry,
  observationText: string,
): FiveWhySuggestion {
  return {
    method: "5 Why",
    whys: [
      `${observationText.length > 60 ? observationText.slice(0, 60) + "…" : observationText} — why did it occur?`,
      entry.factors.proximal,
      entry.factors.contributing,
      entry.factors.systemic,
      entry.rootCause,
    ],
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

function shapeFishbone(entry: PoolEntry): FishboneSuggestion {
  return {
    method: "Fishbone",
    categories: {
      people: entry.factors.people,
      process: entry.factors.process,
      equipment: entry.factors.equipment,
      materials: entry.factors.materials,
      environment: entry.factors.environment,
      management: entry.factors.management,
    },
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

function shapeFreeform(
  entry: PoolEntry,
  method: "Fault Tree" | "Barrier Analysis",
): FreeformSuggestion {
  return {
    method,
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

export function mockRcaSuggestions(
  method: RcaMethod,
  observationText: string,
): RcaSuggestion[] {
  const pool = selectRcaPool(observationText);
  const shaped: RcaSuggestion[] = pool.suggestions.map((entry) => {
    switch (method) {
      case "5 Why":
        return shape5Why(entry, observationText);
      case "Fishbone":
        return shapeFishbone(entry);
      case "Fault Tree":
        return shapeFreeform(entry, "Fault Tree");
      case "Barrier Analysis":
        return shapeFreeform(entry, "Barrier Analysis");
    }
  });
  // Sorted by confidence descending; copy already produced by map().
  return shaped.sort((a, b) => b.confidence - a.confidence);
}

export function mockCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): CAPAPrefill {
  // observationText / severity are accepted for signature parity with the
  // real backend; the mock derives wording from the RCA the user wrote.
  void [observationText, observationSeverity];

  const truncatedTitle =
    rcaRootCause.length > 60 ? rcaRootCause.slice(0, 57) + "..." : rcaRootCause;

  const dueDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    title: "Address: " + truncatedTitle,
    description:
      "Root cause identified: " +
      rcaRootCause +
      ". Corrective action plan: revise relevant SOPs, retrain affected " +
      "personnel, and verify effectiveness within 90 days.",
    suggestedOwnerHint: "Quality Assurance Manager or equivalent",
    suggestedDueDate: dueDate,
    reasoning:
      "Based on observation severity, RCA findings, and historical CAPA " +
      "resolution patterns at this site.",
  };
}

export function mockResponseDraft(event: ResponseDraftEvent): {
  draft: string;
  characterCount: number;
} {
  const obsBlocks = event.observations
    .map((o) => {
      const truncatedText =
        o.text.length > 200 ? o.text.slice(0, 200) + "..." : o.text;
      const rootCauseLine = o.rootCause
        ? `Root Cause: ${o.rootCause}`
        : `Root Cause Analysis: in progress`;
      const correctiveLine = o.capaRef
        ? `Corrective Action: ${o.capaRef} has been raised and assigned to the ` +
          `responsible Quality function. The corrective action plan includes ` +
          `SOP revision, targeted training, and effectiveness verification ` +
          `within 90 days of implementation.`
        : `Corrective Action: CAPA assignment pending.`;
      return (
        `Observation #${o.number}: ${truncatedText}\n\n` +
        `Severity: ${o.severity}\n` +
        `${rootCauseLine}\n` +
        `${correctiveLine}`
      );
    })
    .join("\n\n");

  const draft =
    `Dear [FDA District Office],\n\n` +
    `Pharma Glimmora International received Form FDA-483 issued at the ` +
    `conclusion of the inspection of our ${event.site} facility on ` +
    `${event.inspectionDate}. We appreciate the opportunity to respond to ` +
    `the observations cited in the form.\n\n` +
    `We have completed thorough root cause analysis and initiated corrective ` +
    `and preventive actions (CAPAs) for each observation, as summarized ` +
    `below.\n\n` +
    `${obsBlocks}\n\n` +
    `We are committed to continuous improvement of our quality systems and ` +
    `will provide periodic updates on the effectiveness of these corrective ` +
    `actions. Should the Agency require any additional information or ` +
    `clarification, please contact our Quality Assurance Head.\n\n` +
    `Sincerely,\n\n` +
    `[Signatory name and title will be added at signature time]\n\n` +
    `Pharma Glimmora International`;

  return { draft, characterCount: draft.length };
}
