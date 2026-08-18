import type { Checkpoint, Protocol, ProtocolSection } from '../catalogue';

/**
 * The core Audit Protocol — Sections A–K.
 *
 * Encoded verbatim from "Audit Protocol Checkpoints and Assessment Rules", the
 * governing document behind every category checklist. Category protocols
 * (flours, edible oils, honey, black soap, fashion…) extend and override this
 * spine rather than restating it; the shipped diagnostic reports key their
 * findings to exactly these refs.
 *
 * Three conventions to know before editing:
 *
 * 1. `defaultIfAbsent` is the rating when the CONTROL IS MISSING. It is not the
 *    rating the auditor will pick — that is their judgement, bounded by
 *    `allowedRange`.
 * 2. Where the source document gives a range ("Minor to Major"), the LOWER
 *    severity is the default and the range is the ceiling. Reading it the other
 *    way round would make every documentation gap a Major by default and inflate
 *    every score downward.
 * 3. `defaultOwnerDept` and `defaultClosureText` are lifted from the CAPA
 *    trackers of the shipped reports wherever one exists for that ref — they are
 *    reused near-verbatim across suppliers, so they belong in the catalogue
 *    rather than being retyped per audit. Refs with no shipped precedent are
 *    marked `[inferred]` in a trailing comment.
 */

const SECTIONS: ProtocolSection[] = [
  { letter: 'A', title: 'Legal & Regulatory Documentation' },
  { letter: 'B', title: 'Facility Infrastructure & Layout' },
  { letter: 'C', title: 'Raw Material Control & Traceability' },
  { letter: 'D', title: 'Production Process Control' },
  { letter: 'E', title: 'Hygiene, Sanitation & Pest Control' },
  { letter: 'F', title: 'Quality Control & Laboratory Testing' },
  { letter: 'G', title: 'Product Specifications & Finished Goods Release' },
  { letter: 'H', title: 'Packaging, Labelling & Shelf-Life' },
  { letter: 'I', title: 'Storage, Warehousing & Dispatch' },
  { letter: 'J', title: 'Staff, Training & Recall Readiness' },
  { letter: 'K', title: 'Export Readiness & Standards Alignment' },
];

export const CORE_CHECKPOINTS: Checkpoint[] = [
  // ─── A · Legal & Regulatory Documentation ──────────────────────────────────
  {
    ref: 'A.1', section: 'A', order: 1,
    text: 'Business registration / operating licence',
    guidance: 'CAC certificate or equivalent, current and matching the trading entity on the packaging.',
    evidence: ['certificate'],
    severityClass: 'FIXED_CRITICAL',
    defaultIfAbsent: 'C',
    defaultOwnerDept: 'Compliance',
    defaultClosureText: 'Obtain and file current business registration for the operating entity.',
    standards: ['CAC'],
  },
  {
    ref: 'A.2', section: 'A', order: 2,
    text: 'Valid NAFDAC product registration',
    guidance: 'Registration number valid for each SKU assessed, not merely for the company.',
    evidence: ['certificate'],
    severityClass: 'FIXED_CRITICAL',
    defaultIfAbsent: 'C',
    defaultOwnerDept: 'Compliance',
    defaultClosureText: 'Obtain valid NAFDAC product registration for every SKU offered for listing.',
    standards: ['NAFDAC'],
  },
  {
    ref: 'A.3', section: 'A', order: 3,
    text: 'SON / NIS compliance',
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'Compliance',
    defaultClosureText: 'Obtain SON / NIS (MANCAP) certification.',
    standards: ['SON', 'MANCAP'],
  },
  {
    ref: 'A.4', section: 'A', order: 4,
    text: 'HACCP / food safety management documentation',
    guidance: 'A complete, verified plan — hazard analysis, CCPs, monitoring, corrective actions, verification. SOPs alone are not a HACCP plan.',
    evidence: ['sop', 'record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['M', 'C'], majorPoints: 2,
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Document and verify a full HACCP plan, designating metal detection as a Critical Control Point.',
    standards: ['HACCP', 'ISO 22000'],
  },
  {
    ref: 'A.5', section: 'A', order: 5,
    text: 'Fortification compliance certificate',
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'C',
    appliesWhen: { fact: 'labelClaims', op: 'contains', value: 'fortified' },
    defaultOwnerDept: 'Compliance',
    defaultClosureText: 'Obtain a fortification compliance certificate covering every fortified SKU.',
    standards: ['NAFDAC'],
  },

  // ─── B · Facility Infrastructure & Layout ──────────────────────────────────
  {
    ref: 'B.1', section: 'B', order: 1,
    text: 'Unidirectional process flow',
    guidance: 'Raw material, in-process and finished goods physically separated so product never crosses back over its own path.',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Production / Engineering',
    defaultClosureText: 'Re-zone the facility so raw, in-process and finished goods flow in one direction without crossover.',
  },
  {
    ref: 'B.2', section: 'B', order: 2,
    text: 'Lighting (shatterproof) and ventilation',
    guidance: 'Missing shatterproof covers over product zones is a physical-hazard concern; poor ventilation alone is Minor.',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Facilities',
    defaultClosureText: 'Fit shatterproof covers to all lighting over product zones and improve extraction.',
  },
  {
    ref: 'B.3', section: 'B', order: 3,
    text: 'Clean, smooth, impervious surfaces',
    guidance: 'Minor if cosmetic; Major if surfaces are damaged enough to harbour contamination.',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Facilities',
    defaultClosureText: 'Repair and reseal floors, walls and product-contact surfaces so they are smooth, cleanable and intact.',
  },
  {
    ref: 'B.4', section: 'B', order: 4,
    text: 'Metal detection / magnetic separation',
    guidance: 'Section 8 non-negotiable. Absence is Critical on any milled or comminuted product, with no auditor discretion.',
    evidence: ['photo', 'record'],
    severityClass: 'FIXED_CRITICAL',
    defaultIfAbsent: 'C',
    defaultOwnerDept: 'Production / Engineering',
    defaultClosureText: 'Install in-line metal detection / magnetic separation.',
  },

  // ─── C · Raw Material Control & Traceability ───────────────────────────────
  {
    ref: 'C.1', section: 'C', order: 1,
    text: 'Approved supplier list',
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['O', 'Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Procurement / QA',
    defaultClosureText: 'Maintain an approved supplier list linking each raw material to a named source.',
  },
  {
    ref: 'C.2', section: 'C', order: 2,
    text: 'Intake inspection for foreign matter / mould / moisture',
    guidance: 'Escalates to Critical where mould is actually present with no quarantine (Section 8 #6).',
    evidence: ['log', 'record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'QA / Procurement',
    defaultClosureText: 'Introduce and log a documented intake inspection covering foreign matter, mould and moisture.',
  },
  {
    ref: 'C.3', section: 'C', order: 3,
    text: 'Aflatoxin screening at intake',
    guidance: 'Applies to aflatoxin-susceptible substrates. Not applicable to substrates such as plantain.',
    evidence: ['coa', 'log'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['M', 'C'], majorPoints: 3,
    appliesWhen: {
      fact: 'substrates', op: 'containsAny',
      value: ['maize', 'sorghum', 'groundnut', 'groundbean', 'millet', 'rice'],
    },
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Establish intake aflatoxin screening for all susceptible raw materials.',
    standards: ['NAFDAC', 'Codex'],
    limits: [{ parameter: 'Total aflatoxin', max: 10, unit: 'ppb', standard: 'NAFDAC' }],
  },
  {
    ref: 'C.4', section: 'C', order: 4,
    text: 'One-step traceability',
    guidance: 'One step back to supplier and one step forward to customer, per batch.',
    evidence: ['record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'QA / Procurement',
    defaultClosureText: 'Implement one-step-back, one-step-forward batch traceability.',
    standards: ['EU Reg. (EC) 178/2002'],
  },

  // ─── D · Production Process Control ────────────────────────────────────────
  {
    ref: 'D.1', section: 'D', order: 1,
    text: 'Moisture control during drying',
    guidance: 'Observation only where the control is practised but inconsistently logged.',
    evidence: ['log', 'measurement'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['O', 'Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'processes', op: 'contains', value: 'drying' },
    defaultOwnerDept: 'Production / QA',
    defaultClosureText: 'Log per-batch moisture readings against the documented target.',
  },
  {
    ref: 'D.2', section: 'D', order: 2,
    text: 'Sieve integrity / magnet operational',
    guidance: 'Total absence of metal detection is the Critical B.4; this covers the condition of what is installed.',
    evidence: ['log', 'photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'metalContactSteps', op: 'isTrue' },
    defaultOwnerDept: 'Production / Engineering',
    defaultClosureText: 'Introduce a documented sieve and magnet integrity check each shift.',
  },
  {
    ref: 'D.3', section: 'D', order: 3,
    text: 'Allergen segregation',
    guidance: 'Critical where allergen-bearing and allergen-free products share lines with undeclared risk.',
    evidence: ['sop', 'record'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'C',
    appliesWhen: {
      all: [
        { fact: 'allergensPresent', op: 'containsAny', value: ['soy', 'peanut', 'tree-nut', 'gluten', 'milk', 'sesame', 'egg'] },
        { fact: 'sharedProductionLines', op: 'isTrue' },
      ],
    },
    defaultOwnerDept: 'Production / QA',
    defaultClosureText: 'Segregate allergen-bearing production, or validate changeover cleaning between runs.',
  },
  {
    ref: 'D.4', section: 'D', order: 4,
    text: 'Cyanide (HCN) reduction for cassava',
    guidance: 'No reduction process for cassava is a Section 8 / Red Flag Critical.',
    evidence: ['sop', 'log'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'C',
    appliesWhen: { fact: 'substrates', op: 'contains', value: 'cassava' },
    defaultOwnerDept: 'Production / QA',
    defaultClosureText: 'Document and validate the cyanide reduction process (soaking, fermentation, drying) with per-batch records.',
    standards: ['Codex CXS 176'],
    limits: [{ parameter: 'Total HCN', max: 10, unit: 'mg/kg', standard: 'Codex CXS 176' }],
  },
  {
    ref: 'D.5', section: 'D', order: 5,
    text: 'Gelatinisation parameters validated',
    evidence: ['log', 'sop'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'processes', op: 'containsAny', value: ['gelatinisation', 'extrusion'] },
    defaultOwnerDept: 'Production / QA',
    defaultClosureText: 'Validate and record gelatinisation time and temperature against the product SOP.',
  },
  {
    ref: 'D.6', section: 'D', order: 6,
    text: 'Fermentation monitoring',
    guidance: 'Applies to fermented products — ogi, fufu, lafun, sour garri.',
    evidence: ['log'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'processes', op: 'contains', value: 'fermentation' },
    defaultOwnerDept: 'Production',
    defaultClosureText: 'Log fermentation time, temperature and pH per batch.',
  },

  // ─── E · Hygiene, Sanitation & Pest Control ────────────────────────────────
  {
    ref: 'E.1', section: 'E', order: 1,
    text: 'Cleaning validation between runs',
    evidence: ['sop', 'log'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Hygiene / QA',
    defaultClosureText: 'Document and validate a cleaning procedure between production runs.',
  },
  {
    ref: 'E.2', section: 'E', order: 2,
    text: 'Documented pest control programme',
    evidence: ['record', 'certificate'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'Hygiene / Warehouse',
    defaultClosureText: 'Engage a NAFDAC-recognised pest-control contractor and retain treatment records.',
  },
  {
    ref: 'E.3', section: 'E', order: 3,
    text: 'Potable water for processing',
    guidance: 'Rises to Critical where water is clearly unsafe.',
    evidence: ['coa'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['O', 'Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'waterUsedInProcess', op: 'isTrue' },
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'QA',
    defaultClosureText: 'Obtain and file a current potable water analysis (microbial and chemical) for processing and cleaning water.',
  },
  {
    ref: 'E.4', section: 'E', order: 4,
    text: 'Staff PPE',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'Hygiene / QA',
    defaultClosureText: 'Provide and enforce complete PPE — hairnets, coats, gloves and dedicated footwear.',
  },

  // ─── F · Quality Control & Laboratory Testing ──────────────────────────────
  {
    ref: 'F.1', section: 'F', order: 1,
    text: 'Equipment calibration',
    guidance: 'Invalidates every measurement-based claim — moisture, weight, temperature.',
    evidence: ['certificate', 'record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'QA',
    defaultClosureText: 'Calibrate scales, thermometers and moisture meters, and retain calibration certificates.',
  },
  {
    ref: 'F.2', section: 'F', order: 2,
    text: 'Routine aflatoxin / mycotoxin testing of finished product',
    guidance: 'Effectively Critical for high-risk maize, sorghum and legume lines. A confirmed exceedance is always Critical.',
    evidence: ['coa'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['M', 'C'], majorPoints: 3,
    appliesWhen: {
      fact: 'substrates', op: 'containsAny',
      value: ['maize', 'sorghum', 'groundnut', 'groundbean', 'millet', 'rice'],
    },
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Engage an ISO/IEC 17025 accredited laboratory for routine finished-product mycotoxin testing.',
    standards: ['ISO/IEC 17025', 'Codex'],
    limits: [{ parameter: 'Total aflatoxin', max: 10, unit: 'ppb', standard: 'NAFDAC' }],
  },
  {
    ref: 'F.3', section: 'F', order: 3,
    text: 'HCN testing per batch for cassava',
    guidance: 'Major where the reduction process exists but no batch COA is held. A confirmed exceedance is Critical.',
    evidence: ['coa'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['M', 'C'], majorPoints: 2,
    appliesWhen: { fact: 'substrates', op: 'contains', value: 'cassava' },
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Obtain per-batch HCN certificates of analysis for all cassava-derived product.',
    limits: [{ parameter: 'Total HCN', max: 10, unit: 'mg/kg', standard: 'Codex CXS 176' }],
  },
  {
    ref: 'F.4', section: 'F', order: 4,
    text: 'Routine microbial / toxicological analysis',
    evidence: ['coa'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'QA',
    defaultClosureText: 'Establish a routine microbiological testing schedule with an accredited laboratory.',
    standards: ['ISO/IEC 17025'],
  },
  {
    ref: 'F.5', section: 'F', order: 5,
    text: 'Fortification assay per batch',
    guidance: 'Critical where fortification is label-claimed — the offence is mislabelled nutrition.',
    evidence: ['coa'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'C',
    appliesWhen: { fact: 'labelClaims', op: 'contains', value: 'fortified' },
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Assay micronutrient levels per batch and retain certificates supporting the label claim.',
  },

  // ─── G · Product Specifications & Finished Goods Release ───────────────────
  {
    ref: 'G.1', section: 'G', order: 1,
    text: 'Documented product specifications',
    evidence: ['sop'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'QA / Product',
    defaultClosureText: 'Author a finished-product specification covering organoleptic, physical and chemical parameters.',
  },
  {
    ref: 'G.2', section: 'G', order: 2,
    text: 'Positive release system',
    guidance: 'Minor as a documentation gap; Major where product is genuinely dispatched with no QA check at all.',
    evidence: ['record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'QA',
    defaultClosureText: 'Introduce a documented positive-release step before dispatch.',
  },
  {
    ref: 'G.3', section: 'G', order: 3,
    text: 'Shelf-life supported by stability studies',
    guidance: 'Observation for a modest claim; Minor where an aggressive shelf-life claim is unsupported.',
    evidence: ['record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'O', allowedRange: ['O', 'Mi'],
    defaultOwnerDept: 'QA',
    defaultClosureText: 'Initiate accelerated stability studies to support the declared shelf life.',
  },

  // ─── H · Packaging, Labelling & Shelf-Life ─────────────────────────────────
  {
    ref: 'H.1', section: 'H', order: 1,
    text: 'Food-grade packaging with moisture-barrier seal',
    guidance: 'Observation only where seal verification is merely informal.',
    evidence: ['certificate', 'photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['O', 'Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Packaging / QA',
    defaultClosureText: 'Obtain food-grade certification for all primary packaging and verify seal integrity per batch.',
  },
  {
    ref: 'H.2', section: 'H', order: 2,
    text: 'Batch code, production / best-before dates',
    guidance: 'No batch code cripples traceability and recall.',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Packaging / QA',
    defaultClosureText: 'Print batch code, production date and best-before date on every unit.',
  },
  {
    ref: 'H.3', section: 'H', order: 3,
    text: 'Full label declarations',
    guidance: 'Critical where an allergen is undeclared on a composite or fortified product (Section 8 #5).',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'M', allowedRange: ['M', 'C'], majorPoints: 2,
    escalatesOnConfirmedFinding: true,
    defaultOwnerDept: 'Compliance / QA',
    defaultClosureText: 'Complete label declarations including full ingredient list and allergen statement.',
    standards: ['NAFDAC', 'Codex'],
  },
  {
    ref: 'H.4', section: 'H', order: 4,
    text: 'Micronutrient NRV declaration',
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'C',
    appliesWhen: { fact: 'labelClaims', op: 'contains', value: 'fortified' },
    defaultOwnerDept: 'Compliance / QA',
    defaultClosureText: 'Declare micronutrient content against NRV on the label of every fortified SKU.',
  },

  // ─── I · Storage, Warehousing & Dispatch ───────────────────────────────────
  {
    ref: 'I.1', section: 'I', order: 1,
    text: 'Off-floor pallet storage',
    guidance: 'Major where there is real moisture or pest exposure; Observation where isolated.',
    evidence: ['photo'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'O', allowedRange: ['O', 'Mi', 'M'], majorPoints: 2,
    defaultOwnerDept: 'Warehouse',
    defaultClosureText: 'Install pallet racking with wall clearance and enforce off-floor storage consistently.',
  },
  {
    ref: 'I.2', section: 'I', order: 2,
    text: 'Dry, humidity-monitored storage',
    evidence: ['log'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'Warehouse',
    defaultClosureText: 'Install humidity logging in the finished-goods store.',
  },
  {
    ref: 'I.3', section: 'I', order: 3,
    text: 'FIFO / FEFO enforcement',
    guidance: 'Minor unless expired stock is actually co-mingled.',
    evidence: ['record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'Warehouse',
    defaultClosureText: 'Enforce and record FIFO/FEFO stock rotation.',
  },

  // ─── J · Staff, Training & Recall Readiness ────────────────────────────────
  {
    ref: 'J.1', section: 'J', order: 1,
    text: 'Documented staff training',
    guidance: 'Observation where informal training happens; Minor where there is no training at all.',
    evidence: ['record'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'O', allowedRange: ['O', 'Mi'],
    defaultOwnerDept: 'HR / QA',
    defaultClosureText: 'Build a training matrix including aflatoxin and allergen awareness.',
  },
  {
    ref: 'J.2', section: 'J', order: 2,
    text: 'Written, drilled recall procedure',
    guidance: 'Section 8 non-negotiable. Recall capability is the safety net beneath every other control.',
    evidence: ['sop', 'record'],
    severityClass: 'FIXED_CRITICAL',
    defaultIfAbsent: 'C',
    defaultOwnerDept: 'QA Lead',
    defaultClosureText: 'Author a recall SOP and complete a mock recall drill.',
  },
  {
    ref: 'J.3', section: 'J', order: 3,
    text: 'Complaint management log',
    guidance: 'Major where there is no system at all to catch safety signals.',
    evidence: ['log'],
    severityClass: 'BY_DEGREE',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'],
    defaultOwnerDept: 'QA / Customer Service',
    defaultClosureText: 'Formalise a complaint log with root-cause analysis.',
  },

  // ─── K · Export Readiness & Standards Alignment ────────────────────────────
  {
    ref: 'K.1', section: 'K', order: 1,
    text: 'AfCFTA / FDA / EU standards alignment',
    guidance: 'Only assessed where the supplier declares export markets.',
    evidence: ['certificate'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'Mi', allowedRange: ['Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'isExporting', op: 'isTrue' },
    defaultOwnerDept: 'Compliance / Export',
    defaultClosureText: 'Align documentation and specifications with the declared destination market standards.',
    standards: ['AfCFTA', 'EU', 'FDA'],
  },
  {
    ref: 'K.2', section: 'K', order: 2,
    text: 'Certificate of Origin & phytosanitary certificate',
    guidance: 'Blocks export listing but not domestic safety.',
    evidence: ['certificate'],
    severityClass: 'CONDITIONAL',
    defaultIfAbsent: 'M', allowedRange: ['Mi', 'M'], majorPoints: 2,
    appliesWhen: { fact: 'isExporting', op: 'isTrue' },
    defaultOwnerDept: 'Compliance / Export',
    defaultClosureText: 'Obtain Certificate of Origin and phytosanitary certificate.',
    standards: ['AfCFTA ROO', 'NAQS'],
  },
];

/**
 * The Section 8 non-negotiables. Shipped reports cite these by number
 * constantly ("Section 8 non-negotiable #2") but no document we hold lists them
 * in full — the numbering below is reconstructed from the citations found in
 * the four diagnostic reports and must be confirmed with the standards team
 * before it is printed in a generated report.
 *
 * Confirmed from citations: #1 NAFDAC registration, #2 aflatoxin exceedance,
 * #3 HCN exceedance, #5 allergen/fortification declaration, #6 mould with no
 * quarantine, #7 metal detection, #9 tested recall procedure.
 * Unknown: #4 (cited once as "undeclared sulphite above Codex limits"), #8.
 */
export const CORE_NON_NEGOTIABLES: Protocol['nonNegotiables'] = [
  { number: 1, description: 'Valid NAFDAC product registration', checkpointRef: 'A.2' },
  { number: 2, description: 'Confirmed aflatoxin exceedance in a maize or legume product', checkpointRef: 'F.2' },
  { number: 3, description: 'Confirmed HCN exceedance in a cassava product', checkpointRef: 'F.3' },
  { number: 4, description: 'Undeclared sulphite above Codex limits', checkpointRef: 'H.3' },
  { number: 5, description: 'Undeclared allergen on a composite or fortified product', checkpointRef: 'H.3' },
  { number: 6, description: 'Mould present at intake with no quarantine', checkpointRef: 'C.2' },
  { number: 7, description: 'Metal detection absent on milled product', checkpointRef: 'B.4' },
  { number: 9, description: 'No written and tested recall procedure', checkpointRef: 'J.2' },
];

export const CORE_PROTOCOL: Protocol = {
  code: 'AFZ-QA-CORE-000',
  name: 'Core Conformity Assessment Protocol',
  version: '1.0',
  productClasses: [],
  sections: SECTIONS,
  checkpoints: CORE_CHECKPOINTS,
  nonNegotiables: CORE_NON_NEGOTIABLES,
  preVisitDocs: [
    'Business registration (CAC) certificate',
    'NAFDAC product registration certificate(s)',
    'SON / MANCAP certificate',
    'HACCP plan or food safety manual',
    'Approved supplier list',
    'Recent laboratory certificates of analysis',
    'Product label artwork',
    'Recall procedure',
  ],
};
