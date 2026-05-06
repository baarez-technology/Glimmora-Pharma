import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with comprehensive data...\n");

  // ══════════════════════════════════════════════════════════════════════════
  // CLEANUP - Remove existing data to avoid duplicates
  // ══════════════════════════════════════════════════════════════════════════

  await prisma.auditLog.deleteMany();
  await prisma.simulation.deleteMany();
  await prisma.readinessAction.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.roadmapActivity.deleteMany();
  await prisma.rTMEntry.deleteMany();
  await prisma.validationStage.deleteMany();
  await prisma.fDA483Commitment.deleteMany();
  await prisma.fDA483Observation.deleteMany();
  await prisma.fDA483Event.deleteMany();
  await prisma.cAPADocument.deleteMany();
  await prisma.cAPA.deleteMany();
  await prisma.deviation.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.gxPSystem.deleteMany();
  await prisma.document.deleteMany();
  await prisma.rAIDItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.site.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();

  console.log("✓ Cleaned up existing data\n");

  // ══════════════════════════════════════════════════════════════════════════
  // TENANTS & AUTH
  // ══════════════════════════════════════════════════════════════════════════

  // Super Admin tenant
  const superAdmin = await prisma.tenant.create({
    data: {
      customerCode: "SUPER_001",
      name: "Glimmora Platform",
      username: "superadmin",
      email: "superadmin@glimmora.com",
      passwordHash: await bcrypt.hash("1", 10),
      role: "super_admin",
      isActive: true,
    },
  });
  console.log("✓ Super admin:", superAdmin.id);

  // Demo customer tenant - Use fixed ID matching frontend
  const DEMO_TENANT_ID = "tenant-glimmora";
  const demo = await prisma.tenant.create({
    data: {
      id: DEMO_TENANT_ID,
      customerCode: "PGI_001",
      name: "Pharma Glimmora International",
      username: "admin",
      email: "admin@pharmaglimmora.com",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      role: "customer_admin",
      timezone: "Asia/Kolkata",
      isActive: true,
    },
  });
  console.log("✓ Demo tenant:", demo.id);

  // Subscription
  await prisma.subscription.create({
    data: {
      tenantId: demo.id,
      maxAccounts: 15,
      startDate: new Date("2026-01-01"),
      expiryDate: new Date("2026-12-31"),
      status: "Active",
    },
  });
  console.log("✓ Subscription created");

  // ══════════════════════════════════════════════════════════════════════════
  // SITES - Use hardcoded IDs matching frontend Redux initial state
  // ══════════════════════════════════════════════════════════════════════════

  const mumbai = await prisma.site.create({
    data: { id: "site-gl-1", tenantId: demo.id, name: "Mumbai API Plant", location: "Mumbai, Maharashtra", gmpScope: "API Manufacturing", risk: "HIGH" },
  });
  const bangalore = await prisma.site.create({
    data: { id: "site-gl-2", tenantId: demo.id, name: "Bangalore R&D Centre", location: "Bangalore, Karnataka", gmpScope: "R&D", risk: "MEDIUM" },
  });
  const chennai = await prisma.site.create({
    data: { id: "site-gl-3", tenantId: demo.id, name: "Chennai QC Laboratory", location: "Chennai, Tamil Nadu", gmpScope: "QC Testing", risk: "HIGH" },
  });
  const hyderabad = await prisma.site.create({
    data: { id: "site-gl-4", tenantId: demo.id, name: "Hyderabad Formulation", location: "Hyderabad, Telangana", gmpScope: "Formulation", risk: "HIGH" },
  });
  console.log("✓ Sites: Mumbai, Bangalore, Chennai, Hyderabad");

  // ══════════════════════════════════════════════════════════════════════════
  // USERS - Passwords match frontend mock accounts
  // ══════════════════════════════════════════════════════════════════════════

  const usersList = [
    { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", username: "priya.sharma", role: "qa_head", gxpSignatory: true, siteId: chennai.id, password: "QaHead@123" },
    { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", username: "rahul.mehta", role: "regulatory_affairs", gxpSignatory: true, siteId: mumbai.id, password: "RegAff@123" },
    { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", username: "anita.patel", role: "csv_val_lead", gxpSignatory: true, siteId: chennai.id, password: "CsvVal@123" },
    { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", username: "nisha.rao", role: "qc_lab_director", gxpSignatory: true, siteId: chennai.id, password: "QcLab@123" },
    { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", username: "vikram.singh", role: "it_cdo", gxpSignatory: false, siteId: bangalore.id, password: "ItCdo@123" },
    { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", username: "suresh.kumar", role: "operations_head", gxpSignatory: false, siteId: hyderabad.id, password: "OpsHead@123" },
    { id: "u-008", name: "Meera Krishnan", email: "viewer@pharmaglimmora.com", username: "meera.krishnan", role: "viewer", gxpSignatory: false, siteId: mumbai.id, password: "Viewer@123" },
  ];

  const users: Record<string, string> = {};
  for (const u of usersList) {
    const { password, id, ...userData } = u;
    const user = await prisma.user.create({
      data: { id, tenantId: demo.id, ...userData, passwordHash: await bcrypt.hash(password, 10) },
    });
    users[u.role] = user.id;
    users[u.id] = user.id;
  }
  console.log("✓ Users:", usersList.length);

  // ══════════════════════════════════════════════════════════════════════════
  // FINDINGS (Gap Assessment) - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const findings = [
    {
      id: "FIND-001",
      requirement: "Audit trail not enabled in LIMS — 21 CFR 11.10(e)",
      area: "Laboratory",
      framework: "21 CFR Part 11",
      severity: "Critical",
      status: "In Progress",
      owner: users["u-004"],
      siteId: chennai.id,
      targetDate: new Date("2026-05-01"),
      rootCause: "LIMS configuration not enforcing audit trail for all GxP-critical fields",
      evidenceLink: "https://docs.pharmaglimmora.com/lims-gap-assessment",
    },
    {
      id: "FIND-002",
      requirement: "E-signature not enforced in CDS — 21 CFR 11.50",
      area: "Laboratory",
      framework: "21 CFR Part 11",
      severity: "Critical",
      status: "Open",
      owner: users["u-005"],
      siteId: chennai.id,
      targetDate: new Date("2026-05-15"),
      rootCause: "CDS e-signature module not configured for method approvals",
    },
    {
      id: "FIND-003",
      requirement: "Temperature monitoring records incomplete for cold storage units",
      area: "Storage & Distribution",
      framework: "EU GMP Annex 11",
      severity: "Critical",
      status: "Open",
      owner: users["u-002"],
      siteId: chennai.id,
      targetDate: new Date("2026-05-20"),
      rootCause: "Manual logging process prone to human error",
    },
    {
      id: "FIND-004",
      requirement: "Batch record review not completed within 30 days",
      area: "Production",
      framework: "21 CFR 211.192",
      severity: "Major",
      status: "Open",
      owner: users["u-002"],
      siteId: mumbai.id,
      targetDate: new Date("2026-05-25"),
    },
    {
      id: "FIND-005",
      requirement: "Equipment qualification status not current for HPLC units",
      area: "Laboratory",
      framework: "GAMP 5",
      severity: "Major",
      status: "Closed",
      owner: users["u-005"],
      siteId: chennai.id,
      targetDate: new Date("2026-04-01"),
    },
    {
      id: "FIND-006",
      requirement: "Deviation trending analysis not performed quarterly",
      area: "Quality Systems",
      framework: "ICH Q10",
      severity: "Minor",
      status: "Open",
      owner: users["u-002"],
      siteId: hyderabad.id,
      targetDate: new Date("2026-06-01"),
    },
    {
      id: "FIND-007",
      requirement: "Electronic signature policy not aligned with Part 11 requirements",
      area: "Data Integrity",
      framework: "21 CFR Part 11",
      severity: "Critical",
      status: "In Progress",
      owner: users["u-006"],
      siteId: bangalore.id,
      targetDate: new Date("2026-04-30"),
    },
    {
      id: "FIND-008",
      requirement: "Change control procedure missing risk assessment step",
      area: "Quality Systems",
      framework: "ICH Q9",
      severity: "Major",
      status: "Open",
      owner: users["u-002"],
      siteId: mumbai.id,
      targetDate: new Date("2026-05-30"),
    },
    {
      id: "FIND-009",
      requirement: "Supplier qualification records incomplete for critical raw materials",
      area: "Supply Chain",
      framework: "EU GMP Chapter 5",
      severity: "Major",
      status: "Open",
      owner: users["u-007"],
      siteId: hyderabad.id,
      targetDate: new Date("2026-06-05"),
    },
    {
      id: "FIND-010",
      requirement: "Computer system access not revoked within 24 hours of termination",
      area: "Data Integrity",
      framework: "21 CFR Part 11",
      severity: "Major",
      status: "In Progress",
      owner: users["u-006"],
      siteId: bangalore.id,
      targetDate: new Date("2026-05-10"),
    },
    {
      id: "FIND-011",
      requirement: "Backup and recovery procedure not tested annually",
      area: "Data Integrity",
      framework: "EU GMP Annex 11",
      severity: "Major",
      status: "Open",
      owner: users["u-006"],
      siteId: mumbai.id,
      targetDate: new Date("2026-06-15"),
    },
    {
      id: "FIND-012",
      requirement: "Training records not linked to SOP revisions",
      area: "Training",
      framework: "21 CFR 211.25",
      severity: "Minor",
      status: "Open",
      owner: users["u-002"],
      siteId: chennai.id,
      targetDate: new Date("2026-06-20"),
    },
  ];

  const createdFindings: string[] = [];
  for (const f of findings) {
    const { id, ...data } = f;
    const finding = await prisma.finding.create({
      data: { id, tenantId: demo.id, createdBy: users["u-002"], ...data },
    });
    createdFindings.push(finding.id);
  }
  console.log("✓ Findings:", findings.length);

  // ══════════════════════════════════════════════════════════════════════════
  // CAPAs - Comprehensive data with various states
  // ══════════════════════════════════════════════════════════════════════════

  const capas = [
    {
      id: "CAPA-1417",
      findingId: "FIND-001",
      source: "Gap Assessment",
      description: "Configure LIMS audit trail for all GxP-critical fields",
      risk: "HIGH",
      owner: users["u-004"],
      siteId: chennai.id,
      dueDate: new Date("2026-05-15"),
      status: "Closed",
      rca: "Initial LIMS configuration did not include all required audit trail fields per 21 CFR 11.10(e)",
      rcaMethod: "Fishbone",
      correctiveActions: "1. Identify all GxP-critical fields\n2. Enable audit trail for each field\n3. Validate configuration\n4. Update SOPs",
      diGate: true,
      diGateStatus: "Cleared",
      diGateReviewedBy: users["u-002"],
      diGateReviewDate: new Date("2026-04-15"),
      closedBy: users["u-002"],
      closedAt: new Date("2026-04-16"),
    },
    {
      id: "CAPA-1418",
      findingId: "FIND-002",
      source: "Gap Assessment",
      description: "E-signature validation for CDS",
      risk: "HIGH",
      owner: users["u-005"],
      siteId: chennai.id,
      dueDate: new Date("2026-05-30"),
      status: "In Progress",
      rca: "CDS e-signature module was not activated during initial deployment",
      rcaMethod: "5 Why",
      correctiveActions: "1. Activate e-signature module\n2. Configure signature meanings\n3. Execute OQ\n4. Train users",
      diGate: true,
      diGateStatus: "Pending",
    },
    {
      id: "CAPA-1419",
      findingId: "FIND-003",
      source: "Gap Assessment",
      description: "Implement automated temperature monitoring system with electronic alerts",
      risk: "HIGH",
      owner: users["u-002"],
      siteId: chennai.id,
      dueDate: new Date("2026-06-01"),
      status: "Open",
      rca: "Lack of automated monitoring led to incomplete records and potential data gaps",
      rcaMethod: "5 Why",
      correctiveActions: "1. Procure IoT temperature sensors\n2. Integrate with SCADA\n3. Configure alert thresholds\n4. Train personnel",
      diGate: true,
      diGateStatus: "Pending",
    },
    {
      id: "CAPA-1420",
      source: "Internal Audit",
      description: "Establish electronic batch record review workflow with escalation",
      risk: "MEDIUM",
      owner: users["u-002"],
      siteId: mumbai.id,
      dueDate: new Date("2026-06-15"),
      status: "Open",
      correctiveActions: "1. Define review workflow\n2. Configure system alerts\n3. Implement escalation rules",
    },
    {
      id: "CAPA-1421",
      source: "Customer Complaint",
      description: "Revise packaging inspection procedure to prevent label mix-ups",
      risk: "HIGH",
      owner: users["u-007"],
      siteId: hyderabad.id,
      dueDate: new Date("2026-04-25"),
      status: "Pending QA Review",
      rca: "Insufficient line clearance verification between product changeovers",
      rcaMethod: "5 Why",
      correctiveActions: "1. Implement barcode verification\n2. Add dual verification step\n3. Update line clearance SOP",
      effectivenessCheck: true,
      effectivenessDate: new Date("2026-05-25"),
    },
    {
      id: "CAPA-1422",
      source: "Deviation",
      description: "Update cleaning validation for multi-product equipment",
      risk: "MEDIUM",
      owner: users["u-004"],
      siteId: mumbai.id,
      dueDate: new Date("2026-05-25"),
      status: "Closed",
      rca: "Cleaning validation protocol did not account for all product residues",
      rcaMethod: "Fishbone",
      closedBy: users["u-002"],
      closedAt: new Date("2026-04-10"),
    },
    {
      id: "CAPA-1423",
      source: "FDA 483",
      description: "Implement revised method validation protocol for all impurity methods",
      risk: "HIGH",
      owner: users["u-005"],
      siteId: chennai.id,
      dueDate: new Date("2026-05-30"),
      status: "In Progress",
      rca: "Method validation protocol did not include all ICH Q2 requirements",
      rcaMethod: "Gap Analysis",
      correctiveActions: "1. Revise validation protocol\n2. Execute revalidation\n3. Update method SOPs",
      diGate: false,
    },
    {
      id: "CAPA-1424",
      source: "OOS Investigation",
      description: "Improve dissolution method robustness",
      risk: "HIGH",
      owner: users["u-005"],
      siteId: chennai.id,
      dueDate: new Date("2026-06-10"),
      status: "Open",
      rca: "Dissolution method sensitive to media preparation variations",
      rcaMethod: "5 Why",
      correctiveActions: "1. Conduct method ruggedness study\n2. Tighten media preparation controls\n3. Retrain analysts",
    },
    {
      id: "CAPA-1425",
      source: "Self-Inspection",
      description: "Implement electronic training record system",
      risk: "MEDIUM",
      owner: users["u-002"],
      siteId: chennai.id,
      dueDate: new Date("2026-07-01"),
      status: "Open",
      correctiveActions: "1. Evaluate LMS solutions\n2. Implement selected system\n3. Migrate existing records",
    },
    {
      id: "CAPA-1426",
      source: "Change Control",
      description: "Qualify alternate excipient supplier",
      risk: "MEDIUM",
      owner: users["u-007"],
      siteId: hyderabad.id,
      dueDate: new Date("2026-06-30"),
      status: "In Progress",
      correctiveActions: "1. Conduct supplier audit\n2. Complete qualification protocol\n3. Update approved supplier list",
    },
  ];

  for (const c of capas) {
    const { id, ...data } = c;
    await prisma.cAPA.create({
      data: { id, tenantId: demo.id, createdBy: users["u-002"], ...data },
    });
  }
  console.log("✓ CAPAs:", capas.length);

  // ══════════════════════════════════════════════════════════════════════════
  // DEVIATIONS - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const deviations = [
    {
      id: "DEV-2026-001",
      title: "Temperature excursion in cold room #3",
      description: "Temperature rose to 12°C for 45 minutes due to door left open by cleaning crew",
      type: "Unplanned",
      category: "Environmental",
      severity: "Major",
      area: "Storage",
      detectedBy: users["u-005"],
      detectedDate: new Date("2026-04-10"),
      owner: users["u-002"],
      siteId: chennai.id,
      dueDate: new Date("2026-04-25"),
      status: "open",
      immediateAction: "Transferred products to cold room #2, initiated impact assessment on all stored materials",
      patientSafetyImpact: "Potential impact on stability-sensitive products - requires evaluation",
      productQualityImpact: "Assessment required for 12 batches stored in affected unit",
      batchesAffected: "BTH-2026-0412, BTH-2026-0413, BTH-2026-0414",
    },
    {
      id: "DEV-2026-002",
      title: "Batch yield below specification",
      description: "API batch yield at 78% vs specification of 85% minimum for intermediate compound",
      type: "Unplanned",
      category: "Process",
      severity: "Major",
      area: "Production",
      detectedBy: users["u-007"],
      detectedDate: new Date("2026-04-08"),
      owner: users["u-002"],
      siteId: mumbai.id,
      dueDate: new Date("2026-04-22"),
      status: "investigation",
      immediateAction: "Batch quarantined pending investigation, notified QA and production management",
      rootCause: "Reaction temperature variance during synthesis due to faulty thermocouple",
      rcaMethod: "5 Why",
      productQualityImpact: "Batch rejected, no product released to market",
      batchesAffected: "API-2026-0088",
    },
    {
      id: "DEV-2026-003",
      title: "Missing signature on batch record page 5",
      description: "Operator signature missing for weighing verification step on page 5 of batch record",
      type: "Documentation",
      category: "GDocP",
      severity: "Minor",
      area: "Production",
      detectedBy: users["u-002"],
      detectedDate: new Date("2026-04-12"),
      owner: users["u-007"],
      siteId: hyderabad.id,
      dueDate: new Date("2026-04-19"),
      status: "closed",
      closedBy: users["u-002"],
      closedDate: new Date("2026-04-15"),
      closureNotes: "Signature obtained retrospectively with documented justification. Operator counseled on documentation requirements.",
    },
    {
      id: "DEV-2026-004",
      title: "OOS result for dissolution test",
      description: "Dissolution at 30 min: 72% vs specification of NLT 80% for finished product batch",
      type: "Laboratory",
      category: "OOS",
      severity: "Critical",
      area: "Laboratory",
      detectedBy: users["u-005"],
      detectedDate: new Date("2026-04-14"),
      owner: users["u-005"],
      siteId: chennai.id,
      dueDate: new Date("2026-04-28"),
      status: "open",
      immediateAction: "Initiated OOS investigation per SOP-QC-015, batch quarantined",
      regulatoryImpact: "May require field alert if confirmed OOS after Phase II investigation",
      batchesAffected: "BTH-2026-0420",
    },
    {
      id: "DEV-2026-005",
      title: "Equipment malfunction during coating",
      description: "Coating pan #2 spray gun nozzle clogged during coating operation",
      type: "Unplanned",
      category: "Equipment",
      severity: "Minor",
      area: "Production",
      detectedBy: users["u-007"],
      detectedDate: new Date("2026-04-15"),
      owner: users["u-007"],
      siteId: hyderabad.id,
      dueDate: new Date("2026-04-22"),
      status: "closed",
      immediateAction: "Operation paused, nozzle replaced with spare, coating resumed after verification",
      rootCause: "Coating solution viscosity slightly out of range due to ambient temperature variation",
      rcaMethod: "Fishbone",
      closedBy: users["u-002"],
      closedDate: new Date("2026-04-20"),
      closureNotes: "Preventive maintenance schedule updated to include daily nozzle inspection during coating campaigns",
    },
    {
      id: "DEV-2026-006",
      title: "Raw material received without CoA",
      description: "Excipient lot received from approved supplier without Certificate of Analysis",
      type: "Planned",
      category: "Material",
      severity: "Minor",
      area: "Warehouse",
      detectedBy: users["u-007"],
      detectedDate: new Date("2026-04-16"),
      owner: users["u-007"],
      siteId: mumbai.id,
      dueDate: new Date("2026-04-23"),
      status: "investigation",
      immediateAction: "Material quarantined, CoA requested from supplier urgently",
    },
    {
      id: "DEV-2026-007",
      title: "Power fluctuation in QC laboratory",
      description: "30-second power fluctuation caused HPLC system to restart mid-sequence",
      type: "Unplanned",
      category: "Equipment",
      severity: "Minor",
      area: "Laboratory",
      detectedBy: users["u-005"],
      detectedDate: new Date("2026-04-17"),
      owner: users["u-005"],
      siteId: chennai.id,
      dueDate: new Date("2026-04-24"),
      status: "open",
      immediateAction: "Sequence restarted, samples re-injected, UPS status checked",
      batchesAffected: "BTH-2026-0422, BTH-2026-0423",
    },
  ];

  for (const d of deviations) {
    const { id, ...data } = d;
    await prisma.deviation.create({
      data: { id, tenantId: demo.id, createdBy: users["u-002"], ...data },
    });
  }
  console.log("✓ Deviations:", deviations.length);

  // ══════════════════════════════════════════════════════════════════════════
  // FDA 483 EVENTS - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const fda483Event = await prisma.fDA483Event.create({
    data: {
      id: "FEI-3004795103-2026",
      tenantId: demo.id,
      referenceNumber: "FDA-483-2026-001",
      eventType: "FDA 483",
      agency: "FDA",
      siteId: chennai.id,
      inspectionDate: new Date("2026-03-10"),
      responseDeadline: new Date("2026-04-30"),
      status: "In Progress",
      createdBy: users["u-003"],
    },
  });

  // Observations
  const observations = [
    {
      number: 1,
      text: "Failure to establish laboratory controls that include scientifically sound and appropriate specifications, standards, sampling plans, and test procedures designed to assure that components, drug product containers, closures, in-process materials, labeling, and drug products conform to appropriate standards of identity, strength, quality, and purity.",
      severity: "Critical",
      area: "Laboratory Controls",
      regulation: "21 CFR 211.160(b)",
      status: "In Progress",
      rcaMethod: "Fishbone",
      rootCause: "Inadequate method validation for impurity testing - validation protocol did not include all required ICH Q2 elements",
      responseText: "Pharma Glimmora International acknowledges the observation and has initiated immediate corrective actions...",
    },
    {
      number: 2,
      text: "Failure to thoroughly review any unexplained discrepancy and the failure of a batch or any of its components to meet any of its specifications whether or not the batch has already been distributed.",
      severity: "Major",
      area: "Production and Process Controls",
      regulation: "21 CFR 211.192",
      status: "In Progress",
      rcaMethod: "5 Why",
      rootCause: "OOS investigation procedure not consistently followed - Phase II investigations initiated prematurely",
      responseText: "We have revised our OOS investigation procedure to include mandatory checkpoints...",
    },
    {
      number: 3,
      text: "Failure to have, for each batch of drug product, appropriate laboratory determination of satisfactory conformance to final specifications for the drug product.",
      severity: "Major",
      area: "Laboratory Records",
      regulation: "21 CFR 211.194(a)",
      status: "Open",
    },
  ];

  for (const obs of observations) {
    await prisma.fDA483Observation.create({
      data: { eventId: fda483Event.id, ...obs },
    });
  }

  // Commitments
  const commitments = [
    { text: "Implement revised method validation protocol for all impurity methods", dueDate: new Date("2026-05-30"), owner: users["u-005"], status: "In Progress" },
    { text: "Conduct OOS investigation refresher training for all QC personnel", dueDate: new Date("2026-05-15"), owner: users["u-002"], status: "In Progress" },
    { text: "Revise batch release checklist to ensure all specifications verified", dueDate: new Date("2026-05-20"), owner: users["u-002"], status: "Pending" },
    { text: "Implement electronic lab notebook with enforced workflow", dueDate: new Date("2026-06-30"), owner: users["u-005"], status: "Pending" },
    { text: "Complete retrospective review of 2025 OOS investigations", dueDate: new Date("2026-05-10"), owner: users["u-005"], status: "In Progress" },
  ];

  for (const c of commitments) {
    await prisma.fDA483Commitment.create({
      data: { eventId: fda483Event.id, ...c },
    });
  }
  console.log("✓ FDA 483 Event with", observations.length, "observations and", commitments.length, "commitments");

  // ══════════════════════════════════════════════════════════════════════════
  // GxP SYSTEMS (CSV/CSA) - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const systems = [
    {
      id: "SYS-001",
      name: "LIMS (LabWare)",
      type: "LIMS",
      vendor: "LabWare Inc.",
      version: "7.4.2",
      gxpRelevance: "Major",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "4",
      validationStatus: "Validated",
      riskLevel: "HIGH",
      siteId: chennai.id,
      intendedUse: "Management of laboratory samples, test results, and certificates of analysis",
      owner: users["u-004"],
    },
    {
      id: "SYS-002",
      name: "SAP ERP",
      type: "ERP",
      vendor: "SAP",
      version: "S/4HANA 2023",
      gxpRelevance: "Major",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "4",
      validationStatus: "Validated",
      riskLevel: "HIGH",
      siteId: mumbai.id,
      intendedUse: "Batch management, inventory control, production planning",
      owner: users["u-006"],
    },
    {
      id: "SYS-003",
      name: "Empower CDS",
      type: "CDS",
      vendor: "Waters Corporation",
      version: "3.7",
      gxpRelevance: "Major",
      part11Status: "Non-Compliant",
      annex11Status: "Partial",
      gamp5Category: "4",
      validationStatus: "In Progress",
      riskLevel: "HIGH",
      siteId: chennai.id,
      intendedUse: "HPLC and GC data acquisition and processing",
      owner: users["u-005"],
      plannedActions: "Complete Part 11 gap remediation by Q2 2026",
    },
    {
      id: "SYS-004",
      name: "TrackWise",
      type: "QMS",
      vendor: "Honeywell",
      version: "8.5",
      gxpRelevance: "Major",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "4",
      validationStatus: "Validated",
      riskLevel: "MEDIUM",
      siteId: hyderabad.id,
      intendedUse: "CAPA, deviation, change control, and complaint management",
      owner: users["u-002"],
    },
    {
      id: "SYS-005",
      name: "DeltaV DCS",
      type: "SCADA",
      vendor: "Emerson",
      version: "14.3",
      gxpRelevance: "Critical",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "5",
      validationStatus: "Validated",
      riskLevel: "HIGH",
      siteId: mumbai.id,
      intendedUse: "Process automation for API manufacturing",
      owner: users["u-006"],
    },
    {
      id: "SYS-006",
      name: "Veeva Vault",
      type: "DMS",
      vendor: "Veeva Systems",
      version: "23R2",
      gxpRelevance: "Major",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "4",
      validationStatus: "In Progress",
      riskLevel: "MEDIUM",
      siteId: bangalore.id,
      intendedUse: "Controlled document management and regulatory submissions",
      owner: users["u-003"],
    },
    {
      id: "SYS-007",
      name: "Calibration Manager",
      type: "CMMS",
      vendor: "Blue Mountain",
      version: "9.2",
      gxpRelevance: "Major",
      part11Status: "Compliant",
      annex11Status: "Compliant",
      gamp5Category: "4",
      validationStatus: "Validated",
      riskLevel: "MEDIUM",
      siteId: chennai.id,
      intendedUse: "Equipment calibration scheduling and records management",
      owner: users["u-005"],
    },
    {
      id: "SYS-008",
      name: "Stability Manager",
      type: "Custom",
      vendor: "In-house",
      version: "2.1",
      gxpRelevance: "Major",
      part11Status: "Partial",
      annex11Status: "Partial",
      gamp5Category: "5",
      validationStatus: "Not Started",
      riskLevel: "HIGH",
      siteId: chennai.id,
      intendedUse: "Stability study management and trending",
      owner: users["u-005"],
      plannedActions: "Full validation planned for Q3 2026",
    },
  ];

  const createdSystems: string[] = [];
  for (const s of systems) {
    const { id, ...data } = s;
    const system = await prisma.gxPSystem.create({
      data: { id, tenantId: demo.id, createdBy: users["u-004"], ...data },
    });
    createdSystems.push(system.id);

    // Add validation stages for each system
    const stages = ["URS", "Risk Assessment", "Vendor Assessment", "IQ", "OQ", "PQ", "Validation Summary"];
    for (const stageName of stages) {
      const isValidated = s.validationStatus === "Validated";
      const isInProgress = s.validationStatus === "In Progress";
      await prisma.validationStage.create({
        data: {
          systemId: system.id,
          stageName,
          status: isValidated ? "approved" : isInProgress && stages.indexOf(stageName) < 4 ? "approved" : "not_started",
          approvedBy: isValidated || (isInProgress && stages.indexOf(stageName) < 4) ? users["u-002"] : undefined,
          approvedDate: isValidated ? new Date("2026-01-15") : undefined,
        },
      });
    }
  }
  console.log("✓ GxP Systems:", systems.length);

  // ══════════════════════════════════════════════════════════════════════════
  // RTM ENTRIES
  // ══════════════════════════════════════════════════════════════════════════

  const rtmEntries = [
    { systemId: "SYS-001", ursId: "URS-001", ursRequirement: "System shall maintain audit trail for all data changes", ursPriority: "critical", fsReference: "FS-3.1", fsStatus: "approved", iqTestId: "IQ-015", iqResult: "pass", traceabilityStatus: "complete" },
    { systemId: "SYS-001", ursId: "URS-002", ursRequirement: "System shall support electronic signatures per 21 CFR Part 11", ursPriority: "critical", fsReference: "FS-3.2", fsStatus: "approved", iqTestId: "IQ-016", iqResult: "pass", oqTestId: "OQ-008", oqResult: "pass", traceabilityStatus: "complete" },
    { systemId: "SYS-001", ursId: "URS-003", ursRequirement: "System shall generate Certificate of Analysis automatically", ursPriority: "high", fsReference: "FS-4.1", fsStatus: "approved", oqTestId: "OQ-012", oqResult: "pass", traceabilityStatus: "complete" },
    { systemId: "SYS-001", ursId: "URS-004", ursRequirement: "System shall enforce role-based access control", ursPriority: "critical", fsReference: "FS-2.1", fsStatus: "approved", iqTestId: "IQ-003", iqResult: "pass", traceabilityStatus: "complete" },
    { systemId: "SYS-003", ursId: "URS-001", ursRequirement: "System shall acquire chromatographic data with timestamp", ursPriority: "critical", fsStatus: "pending", traceabilityStatus: "broken" },
    { systemId: "SYS-003", ursId: "URS-002", ursRequirement: "System shall prevent deletion of raw data files", ursPriority: "critical", fsStatus: "missing", traceabilityStatus: "broken" },
    { systemId: "SYS-003", ursId: "URS-003", ursRequirement: "System shall support e-signature for method approval", ursPriority: "critical", fsStatus: "pending", traceabilityStatus: "broken" },
    { systemId: "SYS-006", ursId: "URS-001", ursRequirement: "System shall maintain document version history", ursPriority: "critical", fsReference: "FS-1.1", fsStatus: "approved", iqTestId: "IQ-001", iqResult: "pass", traceabilityStatus: "partial" },
  ];

  for (const rtm of rtmEntries) {
    await prisma.rTMEntry.create({ data: rtm });
  }
  console.log("✓ RTM Entries:", rtmEntries.length);

  // ══════════════════════════════════════════════════════════════════════════
  // ROADMAP ACTIVITIES
  // ══════════════════════════════════════════════════════════════════════════

  const roadmapActivities = [
    { systemId: "SYS-003", title: "Part 11 Gap Assessment", type: "Assessment", status: "Completed", startDate: new Date("2026-02-01"), endDate: new Date("2026-02-15"), owner: users["u-004"] },
    { systemId: "SYS-003", title: "Audit Trail Configuration", type: "Remediation", status: "In Progress", startDate: new Date("2026-04-01"), endDate: new Date("2026-04-30"), owner: users["u-006"] },
    { systemId: "SYS-003", title: "User Access Review", type: "Remediation", status: "Planned", startDate: new Date("2026-05-01"), endDate: new Date("2026-05-15"), owner: users["u-004"] },
    { systemId: "SYS-003", title: "E-Signature Configuration", type: "Remediation", status: "Planned", startDate: new Date("2026-05-15"), endDate: new Date("2026-05-30"), owner: users["u-004"] },
    { systemId: "SYS-003", title: "OQ Execution", type: "Validation", status: "Planned", startDate: new Date("2026-06-01"), endDate: new Date("2026-06-30"), owner: users["u-004"] },
    { systemId: "SYS-006", title: "Initial Risk Assessment", type: "Assessment", status: "Completed", startDate: new Date("2026-01-15"), endDate: new Date("2026-01-30"), owner: users["u-004"] },
    { systemId: "SYS-006", title: "IQ Execution", type: "Validation", status: "In Progress", startDate: new Date("2026-03-15"), endDate: new Date("2026-04-15"), owner: users["u-004"] },
    { systemId: "SYS-006", title: "OQ Execution", type: "Validation", status: "Planned", startDate: new Date("2026-04-20"), endDate: new Date("2026-05-20"), owner: users["u-004"] },
    { systemId: "SYS-008", title: "URS Development", type: "Documentation", status: "Planned", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-15"), owner: users["u-005"] },
  ];

  for (const activity of roadmapActivities) {
    await prisma.roadmapActivity.create({ data: activity });
  }
  console.log("✓ Roadmap Activities:", roadmapActivities.length);

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENTS (Evidence) - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const documents = [
    { fileName: "SOP-QA-001_Document_Control.pdf", fileType: "application/pdf", fileSize: "245 KB", version: "v3.0", status: "approved", description: "Document Control Procedure", linkedModule: "Quality Systems", uploadedBy: users["u-002"], approvedBy: users["u-002"], approvedAt: new Date("2026-01-10") },
    { fileName: "SOP-QC-015_OOS_Investigation.pdf", fileType: "application/pdf", fileSize: "312 KB", version: "v2.1", status: "approved", description: "OOS Investigation Procedure", linkedModule: "Laboratory", uploadedBy: users["u-005"], approvedBy: users["u-002"], approvedAt: new Date("2026-02-05") },
    { fileName: "LIMS_Validation_Summary_Report.pdf", fileType: "application/pdf", fileSize: "1.2 MB", version: "v1.0", status: "approved", description: "LIMS Validation Summary Report", linkedModule: "CSV", linkedRecordId: "SYS-001", uploadedBy: users["u-004"], approvedBy: users["u-002"], approvedAt: new Date("2026-01-20") },
    { fileName: "Temperature_Monitoring_Protocol.docx", fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: "89 KB", version: "v1.0", status: "draft", description: "Temperature Monitoring Remediation Protocol", linkedModule: "CAPA", uploadedBy: users["u-002"] },
    { fileName: "FDA483_Response_Draft.pdf", fileType: "application/pdf", fileSize: "567 KB", version: "v0.3", status: "in_review", description: "FDA 483 Response - Draft for Review", linkedModule: "FDA 483", linkedRecordId: "FEI-3004795103-2026", uploadedBy: users["u-003"] },
    { fileName: "Annual_Product_Review_2025.pdf", fileType: "application/pdf", fileSize: "2.4 MB", version: "v1.0", status: "approved", description: "Annual Product Review for 2025", linkedModule: "Quality Systems", uploadedBy: users["u-002"], approvedBy: users["u-002"], approvedAt: new Date("2026-03-15") },
    { fileName: "SOP-PROD-022_Line_Clearance.pdf", fileType: "application/pdf", fileSize: "156 KB", version: "v4.0", status: "approved", description: "Line Clearance Procedure", linkedModule: "Production", uploadedBy: users["u-007"], approvedBy: users["u-002"], approvedAt: new Date("2026-02-20") },
    { fileName: "Training_Matrix_QC_2026.xlsx", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileSize: "78 KB", version: "v1.0", status: "approved", description: "QC Department Training Matrix", linkedModule: "Training", uploadedBy: users["u-005"], approvedBy: users["u-002"], approvedAt: new Date("2026-01-05") },
    { fileName: "Method_Validation_Protocol_Impurity.pdf", fileType: "application/pdf", fileSize: "445 KB", version: "v2.0", status: "in_review", description: "Method Validation Protocol for Impurity Testing", linkedModule: "Laboratory", uploadedBy: users["u-005"] },
    { fileName: "CDS_Part11_Gap_Assessment.pdf", fileType: "application/pdf", fileSize: "890 KB", version: "v1.0", status: "approved", description: "CDS Part 11 Gap Assessment Report", linkedModule: "CSV", linkedRecordId: "SYS-003", uploadedBy: users["u-004"], approvedBy: users["u-002"], approvedAt: new Date("2026-02-15") },
    { fileName: "Deviation_Trend_Analysis_Q1_2026.pdf", fileType: "application/pdf", fileSize: "678 KB", version: "v1.0", status: "approved", description: "Quarterly Deviation Trend Analysis", linkedModule: "Quality Systems", uploadedBy: users["u-002"], approvedBy: users["u-002"], approvedAt: new Date("2026-04-10") },
    { fileName: "CAPA_Effectiveness_Report_CAPA1417.pdf", fileType: "application/pdf", fileSize: "234 KB", version: "v1.0", status: "approved", description: "CAPA Effectiveness Verification Report", linkedModule: "CAPA", linkedRecordId: "CAPA-1417", uploadedBy: users["u-004"], approvedBy: users["u-002"], approvedAt: new Date("2026-04-16") },
    { fileName: "Supplier_Qualification_Report_XYZ.pdf", fileType: "application/pdf", fileSize: "1.1 MB", version: "v1.0", status: "draft", description: "Supplier Qualification Report - XYZ Chemicals", linkedModule: "Supply Chain", uploadedBy: users["u-007"] },
    { fileName: "Equipment_IQ_OQ_HPLC_Unit5.pdf", fileType: "application/pdf", fileSize: "2.3 MB", version: "v1.0", status: "approved", description: "HPLC Unit 5 IQ/OQ Protocol and Report", linkedModule: "Laboratory", uploadedBy: users["u-005"], approvedBy: users["u-002"], approvedAt: new Date("2026-03-01") },
    { fileName: "SOP-IT-005_Access_Control.pdf", fileType: "application/pdf", fileSize: "198 KB", version: "v2.0", status: "approved", description: "IT Access Control Procedure", linkedModule: "IT", uploadedBy: users["u-006"], approvedBy: users["u-002"], approvedAt: new Date("2026-01-25") },
  ];

  for (const doc of documents) {
    await prisma.document.create({
      data: { tenantId: demo.id, ...doc },
    });
  }
  console.log("✓ Documents:", documents.length);

  // ══════════════════════════════════════════════════════════════════════════
  // RAID ITEMS (Governance) - Comprehensive data
  // ══════════════════════════════════════════════════════════════════════════

  const raidItems = [
    { type: "Risk", title: "FDA inspection pending", description: "Pre-approval inspection expected for new product submission. Site readiness score currently at 40%.", priority: "Critical", owner: users["u-003"], dueDate: new Date("2026-05-30"), status: "Open", impact: "Potential delay in product launch if inspection results in 483", mitigation: "Complete inspection readiness checklist, conduct mock inspection, close all critical CAPAs" },
    { type: "Risk", title: "Key personnel attrition in QC", description: "Two senior analysts have given notice, effective end of May", priority: "High", owner: users["u-005"], dueDate: new Date("2026-05-15"), status: "Open", impact: "Reduced testing capacity by 30%, potential batch release delays", mitigation: "Accelerate hiring, cross-train existing staff, engage contract lab for overflow" },
    { type: "Risk", title: "Supply chain disruption for critical excipient", description: "Single source supplier facing capacity issues, lead time extended to 12 weeks", priority: "Critical", owner: users["u-007"], dueDate: new Date("2026-05-01"), status: "Open", impact: "Production delays possible for 3 products", mitigation: "Qualify alternate supplier, build safety stock" },
    { type: "Action", title: "Complete Part 11 remediation for Empower CDS", description: "Address audit trail and access control gaps identified in gap assessment", priority: "High", owner: users["u-004"], dueDate: new Date("2026-06-30"), status: "In Progress" },
    { type: "Action", title: "Implement electronic batch record system", description: "Deploy EBR for Hyderabad formulation plant", priority: "Medium", owner: users["u-006"], dueDate: new Date("2026-09-30"), status: "Open" },
    { type: "Issue", title: "Batch record review backlog", description: "45 batch records pending final QA review, oldest is 28 days", priority: "High", owner: users["u-002"], dueDate: new Date("2026-04-30"), status: "Open", impact: "Delayed product release, potential compliance finding" },
    { type: "Issue", title: "LIMS performance degradation", description: "System response time increased 40% over last month", priority: "Medium", owner: users["u-006"], dueDate: new Date("2026-05-15"), status: "In Progress", impact: "Reduced lab productivity" },
    { type: "Decision", title: "Select new ELN vendor", description: "Evaluate and select Electronic Lab Notebook solution for QC", priority: "Medium", owner: users["u-006"], dueDate: new Date("2026-06-15"), status: "Open" },
    { type: "Decision", title: "Outsource stability studies", description: "Evaluate whether to outsource long-term stability studies to contract lab", priority: "Low", owner: users["u-005"], dueDate: new Date("2026-07-01"), status: "Open" },
    { type: "Risk", title: "Equipment obsolescence - HPLC fleet", description: "3 HPLC units approaching end of vendor support (Dec 2026)", priority: "Medium", owner: users["u-005"], dueDate: new Date("2026-08-01"), status: "Open", impact: "Potential inability to get spare parts, qualification concerns", mitigation: "Budget for replacement units in 2027" },
  ];

  for (const item of raidItems) {
    await prisma.rAIDItem.create({
      data: { tenantId: demo.id, createdBy: users["u-002"], ...item },
    });
  }
  console.log("✓ RAID Items:", raidItems.length);

  // ══════════════════════════════════════════════════════════════════════════
  // INSPECTIONS (Training & Awareness / Readiness)
  // ══════════════════════════════════════════════════════════════════════════

  // Past completed inspection
  const pastInspection = await prisma.inspection.create({
    data: {
      id: "INSP-2026-000",
      tenantId: demo.id,
      title: "FDA GMP Inspection Q1 2026",
      siteName: "Chennai QC Laboratory",
      agency: "FDA",
      type: "announced",
      status: "completed",
      expectedDate: new Date("2026-03-10"),
      startDate: new Date("2026-03-10"),
      endDate: new Date("2026-03-12"),
      inspectionLead: users["u-002"],
      linkedFDA483Id: "FEI-3004795103-2026",
      notes: "Resulted in FDA 483 with 3 observations",
      createdBy: users["u-002"],
    },
  });

  // Upcoming inspections
  const inspection1 = await prisma.inspection.create({
    data: {
      id: "INSP-2026-001",
      tenantId: demo.id,
      title: "FDA GMP Inspection Q2 2026",
      siteName: "Chennai QC Laboratory",
      agency: "FDA",
      type: "announced",
      status: "preparation",
      expectedDate: new Date("2026-06-01"),
      inspectionLead: users["u-002"],
      notes: "Follow-up inspection after Q1 483 observations",
      createdBy: users["u-002"],
    },
  });

  const inspection2 = await prisma.inspection.create({
    data: {
      id: "INSP-2026-002",
      tenantId: demo.id,
      title: "EMA Annex 11 Review",
      siteName: "Mumbai API Plant",
      agency: "EMA",
      type: "announced",
      status: "preparation",
      expectedDate: new Date("2026-07-15"),
      inspectionLead: users["u-003"],
      createdBy: users["u-002"],
    },
  });

  const inspection3 = await prisma.inspection.create({
    data: {
      id: "INSP-2026-003",
      tenantId: demo.id,
      title: "MHRA GMP Routine Inspection",
      siteName: "Hyderabad Formulation",
      agency: "MHRA",
      type: "announced",
      status: "preparation",
      expectedDate: new Date("2026-08-30"),
      inspectionLead: users["u-002"],
      createdBy: users["u-002"],
    },
  });

  // Readiness actions for inspection 1
  const readinessActions1 = [
    { title: "Brief QA Head and key SMEs on inspection protocol", lane: "People", bucket: "Immediate", priority: "High", status: "Not Started", owner: users["u-002"], dueDate: new Date("2026-05-01") },
    { title: "Assign front-room and back-room roles", lane: "People", bucket: "Immediate", priority: "High", status: "Not Started", owner: users["u-002"], dueDate: new Date("2026-05-05") },
    { title: "Run mock inspection simulation — Chennai site", lane: "People", bucket: "31-60 days", priority: "High", status: "Not Started", owner: users["u-002"], dueDate: new Date("2026-05-20") },
    { title: "Leadership briefing — risk posture and communications", lane: "People", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: users["u-007"], dueDate: new Date("2026-05-25") },
    { title: "Review and update CAPA SOP — close FIND-001 gaps", lane: "Process", bucket: "Immediate", priority: "High", status: "Not Started", owner: users["u-002"], dueDate: new Date("2026-05-08") },
    { title: "Complete ICH Q9 risk assessment updates", lane: "Process", bucket: "31-60 days", priority: "Medium", status: "Not Started", owner: users["u-003"], dueDate: new Date("2026-05-18") },
    { title: "Effectiveness check — closed CAPAs from Q1", lane: "Process", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: users["u-004"], dueDate: new Date("2026-05-28") },
    { title: "Remediate LIMS audit trail — all 12 modules", lane: "Data", bucket: "Immediate", priority: "Critical", status: "Not Started", owner: users["u-004"], dueDate: new Date("2026-05-12") },
    { title: "Validate audit trail logs across all GxP systems", lane: "Data", bucket: "31-60 days", priority: "High", status: "Not Started", owner: users["u-006"], dueDate: new Date("2026-05-22") },
    { title: "Complete DI remediation sign-off report", lane: "Data", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: users["u-004"], dueDate: new Date("2026-05-30") },
    { title: "Complete LIMS Part 11 gap remediation", lane: "Systems", bucket: "Immediate", priority: "Critical", status: "In Progress", owner: users["u-004"], dueDate: new Date("2026-05-10") },
    { title: "CDS e-signature validation OQ completion", lane: "Systems", bucket: "31-60 days", priority: "High", status: "Not Started", owner: users["u-004"], dueDate: new Date("2026-05-20") },
    { title: "MES validation project kickoff", lane: "Systems", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: users["u-006"], dueDate: new Date("2026-05-28") },
    { title: "Compile DIL evidence kit — Chennai QC Lab", lane: "Documentation", bucket: "Immediate", priority: "High", status: "In Progress", owner: users["u-003"], dueDate: new Date("2026-05-10") },
    { title: "Update all SOPs post inspection findings", lane: "Documentation", bucket: "31-60 days", priority: "Medium", status: "Not Started", owner: users["u-002"], dueDate: new Date("2026-05-18") },
    { title: "Archive all inspection evidence documents", lane: "Documentation", bucket: "61-90 days", priority: "Low", status: "Not Started", owner: users["u-003"], dueDate: new Date("2026-05-28") },
  ];

  for (const action of readinessActions1) {
    await prisma.readinessAction.create({
      data: { inspectionId: inspection1.id, ...action },
    });
  }

  // Simulations for inspection 1
  const simulations = [
    { title: "Mock FDA Inspection - Day 1", type: "Full Mock", duration: 480, scheduledAt: new Date("2026-05-15"), participants: "QA Team, QC Team, Production Lead", status: "Scheduled", createdBy: users["u-002"] },
    { title: "Front Room Q&A Practice", type: "Front Room", duration: 120, scheduledAt: new Date("2026-05-08"), participants: "Dr. Priya Sharma, Rahul Mehta, Dr. Nisha Rao", status: "Scheduled", createdBy: users["u-002"] },
    { title: "DIL Handling Drill", type: "DIL Drill", duration: 90, scheduledAt: new Date("2026-05-10"), participants: "Back Room Team", status: "Scheduled", createdBy: users["u-002"] },
    { title: "SME Q&A Practice - QC Lab", type: "SME Q&A", duration: 120, scheduledAt: new Date("2026-04-25"), participants: "QC Analysts, Lab Supervisors", status: "Completed", score: 78, notes: "Good performance, need to improve on Part 11 questions", createdBy: users["u-002"] },
  ];

  for (const sim of simulations) {
    await prisma.simulation.create({
      data: { inspectionId: inspection1.id, ...sim },
    });
  }

  console.log("✓ Inspections: 4 (1 completed, 3 upcoming) with", readinessActions1.length, "readiness actions and", simulations.length, "simulations");

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGS - Comprehensive history
  // ══════════════════════════════════════════════════════════════════════════

  const auditLogs = [
    // Recent critical actions
    { userName: "Anita Patel", userRole: "QA Head", userId: users["u-004"], module: "CAPA Tracker", action: "CAPA_SIGNED_AND_CLOSED", recordId: "CAPA-1417", recordTitle: "Audit trail not enabled in LIMS", oldValue: "Pending QA Review", newValue: "Closed", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-16T09:02:00Z") },
    { userName: "Anita Patel", userRole: "QA Head", userId: users["u-004"], module: "CAPA Tracker", action: "DI_GATE_CLEARED", recordId: "CAPA-1417", recordTitle: "Audit trail not enabled in LIMS", newValue: "DI Gate Cleared", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-16T04:45:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "Gap Assessment", action: "FINDING_CREATED", recordId: "FIND-001", recordTitle: "Audit trail not enabled in LIMS — 21 CFR 11.10(e)", newValue: "Critical", ipAddress: "192.168.1.15", createdAt: new Date("2026-04-15T04:00:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "Gap Assessment", action: "CAPA_RAISED_FROM_FINDING", recordId: "FIND-001", recordTitle: "FIND-001 → CAPA-1417 raised", ipAddress: "192.168.1.15", createdAt: new Date("2026-04-15T04:15:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "FDA 483", action: "RESPONSE_SUBMITTED", recordId: "FEI-3004795103-2026", recordTitle: "FDA 483 — Chennai QC Laboratory", newValue: "Submitted to FDA", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-14T10:30:00Z") },
    { userName: "Anita Patel", userRole: "CSV/Val Lead", userId: users["u-004"], module: "CSV/CSA", action: "AUDIT_TRAIL_ENABLED", recordId: "SYS-001", recordTitle: "LIMS — LabWare 8.x", oldValue: "Not Enabled", newValue: "Enabled", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-13T05:50:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "Customer Admin", userId: users["u-002"], module: "Settings", action: "USER_CREATED", recordId: "u-007", recordTitle: "Vikram Singh — Operations Head", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-12T03:30:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "FDA 483", action: "EVENT_CREATED", recordId: "FEI-3004795103-2026", recordTitle: "FDA 483 — Chennai QC Laboratory", newValue: "Warning Letter", ipAddress: "192.168.1.15", createdAt: new Date("2026-04-11T07:00:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Governance", action: "RAID_ITEM_ADDED", recordId: "RAID-004", recordTitle: "LIMS audit trail remediation overdue", newValue: "Risk — Critical", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-10T08:15:00Z") },
    { userName: "Anita Patel", userRole: "CSV/Val Lead", userId: users["u-004"], module: "CSV/CSA", action: "VALIDATION_STAGE_UPDATED", recordId: "SYS-001", recordTitle: "LIMS — LabWare 8.x", oldValue: "IQ", newValue: "OQ", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-09T06:00:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Training & Awareness", action: "SIMULATION_COMPLETED", recordId: "sim-003", recordTitle: "SME Q&A Practice — QC Lab", newValue: "Score: 78%", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-08T09:30:00Z") },
    { userName: "Dr. Nisha Rao", userRole: "QC/Lab Director", userId: users["u-005"], module: "Evidence & Documents", action: "DOCUMENT_ADDED", recordId: "DOC-012", recordTitle: "LIMS Validation Master Plan v2.1", newValue: "Draft", ipAddress: "192.168.1.20", createdAt: new Date("2026-04-07T04:00:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "Customer Admin", userId: users["u-002"], module: "Settings", action: "SITE_ADDED", recordId: "site-gl-3", recordTitle: "Chennai QC Laboratory", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-06T10:00:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "Gap Assessment", action: "FINDING_STATUS_CHANGED", recordId: "FIND-002", recordTitle: "E-signature not enforced in CDS", oldValue: "Open", newValue: "In Progress", ipAddress: "192.168.1.15", createdAt: new Date("2026-04-05T07:30:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "CAPA Tracker", action: "CAPA_CREATED", recordId: "CAPA-1418", recordTitle: "E-signature validation for CDS", newValue: "High", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-04T11:45:00Z") },
    // Older entries
    { userName: "Dr. Nisha Rao", userRole: "QC/Lab Director", userId: users["u-005"], module: "Deviation", action: "DEVIATION_CREATED", recordId: "DEV-2026-001", recordTitle: "Temperature excursion in cold room #3", newValue: "Major", ipAddress: "192.168.1.20", createdAt: new Date("2026-04-10T05:30:00Z") },
    { userName: "Suresh Kumar", userRole: "Operations Head", userId: users["u-007"], module: "Deviation", action: "DEVIATION_CREATED", recordId: "DEV-2026-002", recordTitle: "Batch yield below specification", newValue: "Major", ipAddress: "192.168.1.25", createdAt: new Date("2026-04-08T06:15:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Deviation", action: "DEVIATION_CLOSED", recordId: "DEV-2026-003", recordTitle: "Missing signature on batch record page 5", oldValue: "Under Investigation", newValue: "Closed", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-15T09:00:00Z") },
    { userName: "Vikram Singh", userRole: "IT/CDO", userId: users["u-006"], module: "CSV/CSA", action: "SYSTEM_ADDED", recordId: "SYS-008", recordTitle: "Stability Manager — In-house v2.1", newValue: "Not Started", ipAddress: "192.168.1.30", createdAt: new Date("2026-04-03T08:00:00Z") },
    { userName: "Anita Patel", userRole: "CSV/Val Lead", userId: users["u-004"], module: "CSV/CSA", action: "ROADMAP_ACTIVITY_COMPLETED", recordId: "SYS-003", recordTitle: "Part 11 Gap Assessment — Empower CDS", newValue: "Completed", ipAddress: "192.168.1.12", createdAt: new Date("2026-02-15T14:00:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Training & Awareness", action: "INSPECTION_CREATED", recordId: "INSP-2026-001", recordTitle: "FDA GMP Inspection Q2 2026", newValue: "Preparation", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-01T09:00:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "FDA 483", action: "OBSERVATION_ADDED", recordId: "OBS-001", recordTitle: "21 CFR 211.160(b) — Laboratory Controls", newValue: "Critical", ipAddress: "192.168.1.15", createdAt: new Date("2026-03-15T11:00:00Z") },
    { userName: "Rahul Mehta", userRole: "Regulatory Affairs", userId: users["u-003"], module: "FDA 483", action: "COMMITMENT_ADDED", recordId: "CMT-001", recordTitle: "Implement revised method validation protocol", newValue: "Due: 2026-05-30", ipAddress: "192.168.1.15", createdAt: new Date("2026-03-16T10:00:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Governance", action: "KPI_UPDATED", recordId: "KPI-CAPA-TIME", recordTitle: "CAPA Timeliness Score", oldValue: "72%", newValue: "78%", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-01T06:00:00Z") },
    { userName: "Admin", userRole: "Customer Admin", userId: demo.id, module: "Auth", action: "USER_LOGIN", recordId: users["u-002"], recordTitle: "Dr. Priya Sharma", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-16T08:00:00Z") },
    { userName: "Admin", userRole: "Customer Admin", userId: demo.id, module: "Auth", action: "USER_LOGIN", recordId: users["u-003"], recordTitle: "Rahul Mehta", ipAddress: "192.168.1.15", createdAt: new Date("2026-04-16T08:15:00Z") },
    { userName: "Admin", userRole: "Customer Admin", userId: demo.id, module: "Auth", action: "USER_LOGIN", recordId: users["u-004"], recordTitle: "Anita Patel", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-16T08:30:00Z") },
    { userName: "Dr. Priya Sharma", userRole: "QA Head", userId: users["u-002"], module: "Evidence & Documents", action: "DOCUMENT_APPROVED", recordId: "DOC-015", recordTitle: "CAPA Effectiveness Report CAPA1417", newValue: "Approved", ipAddress: "192.168.1.10", createdAt: new Date("2026-04-16T11:00:00Z") },
    { userName: "Anita Patel", userRole: "CSV/Val Lead", userId: users["u-004"], module: "CAPA Tracker", action: "CAPA_STATUS_CHANGED", recordId: "CAPA-1418", recordTitle: "E-signature validation for CDS", oldValue: "Open", newValue: "In Progress", ipAddress: "192.168.1.12", createdAt: new Date("2026-04-10T10:00:00Z") },
    { userName: "Dr. Nisha Rao", userRole: "QC/Lab Director", userId: users["u-005"], module: "Deviation", action: "DEVIATION_STATUS_CHANGED", recordId: "DEV-2026-002", recordTitle: "Batch yield below specification", oldValue: "Open", newValue: "Investigation", ipAddress: "192.168.1.20", createdAt: new Date("2026-04-09T14:00:00Z") },
  ];

  for (const log of auditLogs) {
    const { createdAt, userId, ...data } = log;
    await prisma.auditLog.create({
      data: { tenantId: demo.id, userId, ...data, createdAt },
    });
  }
  console.log("✓ Audit Logs:", auditLogs.length);

  // ══════════════════════════════════════════════════════════════════════════
  // CAPA DOCUMENTS
  // ══════════════════════════════════════════════════════════════════════════

  const capaDocuments = [
    { capaId: "CAPA-1417", fileName: "LIMS_Audit_Trail_Configuration_Report.pdf", fileSize: "456 KB", fileType: "application/pdf", version: "v1.0", status: "approved", uploadedBy: users["u-004"], approvedBy: users["u-002"], approvedAt: new Date("2026-04-15"), description: "Audit trail configuration verification report" },
    { capaId: "CAPA-1417", fileName: "LIMS_Part11_Compliance_Checklist.xlsx", fileSize: "78 KB", fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", version: "v1.0", status: "approved", uploadedBy: users["u-004"], approvedBy: users["u-002"], approvedAt: new Date("2026-04-15"), description: "Part 11 compliance checklist - completed" },
    { capaId: "CAPA-1418", fileName: "CDS_E-Signature_OQ_Protocol.pdf", fileSize: "234 KB", fileType: "application/pdf", version: "v0.2", status: "current", uploadedBy: users["u-005"], description: "OQ protocol for e-signature validation - draft" },
    { capaId: "CAPA-1421", fileName: "Line_Clearance_SOP_Rev5.pdf", fileSize: "189 KB", fileType: "application/pdf", version: "v5.0", status: "current", uploadedBy: users["u-007"], description: "Updated line clearance procedure" },
    { capaId: "CAPA-1423", fileName: "Method_Validation_Protocol_Rev.pdf", fileSize: "567 KB", fileType: "application/pdf", version: "v2.0", status: "current", uploadedBy: users["u-005"], description: "Revised method validation protocol per ICH Q2" },
  ];

  for (const doc of capaDocuments) {
    await prisma.cAPADocument.create({ data: doc });
  }
  console.log("✓ CAPA Documents:", capaDocuments.length);

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("✅ Comprehensive seed complete!");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("\nData Summary:");
  console.log("  • Tenants: 2 (Super Admin + Demo)");
  console.log("  • Sites: 4");
  console.log("  • Users: 7");
  console.log("  • Findings: " + findings.length);
  console.log("  • CAPAs: " + capas.length);
  console.log("  • Deviations: " + deviations.length);
  console.log("  • FDA 483 Events: 1 with 3 observations, 5 commitments");
  console.log("  • GxP Systems: " + systems.length);
  console.log("  • RTM Entries: " + rtmEntries.length);
  console.log("  • Documents: " + documents.length);
  console.log("  • RAID Items: " + raidItems.length);
  console.log("  • Inspections: 4 with readiness actions and simulations");
  console.log("  • Audit Logs: " + auditLogs.length);
  console.log("\nLogin credentials:");
  console.log("  Super Admin: superadmin@glimmora.com / 1");
  console.log("  Customer Admin: admin@pharmaglimmora.com / Admin@123");
  console.log("  QA Head: qa@pharmaglimmora.com / QaHead@123");
  console.log("  Regulatory: ra@pharmaglimmora.com / RegAff@123");
  console.log("  CSV Lead: csv@pharmaglimmora.com / CsvVal@123");
  console.log("  QC Director: qc@pharmaglimmora.com / QcLab@123");
  console.log("  IT CDO: it@pharmaglimmora.com / ItCdo@123");
  console.log("  Operations: ops@pharmaglimmora.com / OpsHead@123");
  console.log("══════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
