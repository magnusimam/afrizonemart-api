/**
 * The Assessment Profile — structured product facts that decide which
 * checkpoints an auditor is shown.
 *
 * WHY THIS EXISTS. The PIQ cannot do this job. It is a merchandising
 * questionnaire: the guideline's "why this matters" note against every field
 * talks about search relevance, buyer confidence and conversion. The facts a
 * conformity protocol turns on are either free prose or simply not asked:
 *
 *   • "Contains cassava?"  → `ingredients` is a comma-separated textarea, and
 *     garri, fufu and lafun are all cassava without ever saying the word.
 *   • "Claims fortification?" → not asked anywhere.
 *   • "Fermented?" / "Instant?" → not asked anywhere.
 *   • Category is Food | Fashion | Tech | Home | Health | Other, but the
 *     protocols distinguish edible oils, flours, baby cereal, snacks, honey and
 *     black soap — all of which are "Food" or "Health".
 *
 * At a hundred suppliers a coordinator reads the prose and picks a form. That
 * does not survive ten thousand, and free text cannot be a trigger.
 *
 * DERIVE, THEN CONFIRM. These fields are pre-filled by inference from the PIQ
 * the supplier already completed, then shown back for confirmation. That keeps
 * the added burden small — and a supplier confirming a pre-ticked box is a far
 * stronger evidentiary position than us inferring "this contains cassava"
 * silently and assessing them on cyanide control off the back of it.
 */

/** Substrates that change which safety checkpoints apply. */
export const SUBSTRATES = [
  'cassava', 'maize', 'sorghum', 'millet', 'rice', 'wheat', 'yam', 'cocoyam',
  'plantain', 'potato', 'soy', 'groundnut', 'groundbean', 'beans', 'sesame',
  'coconut', 'palm', 'shea', 'honey', 'dairy', 'egg', 'fish', 'meat',
  'botanical-herb', 'tea-leaf', 'fruit', 'vegetable', 'cocoa', 'other',
] as const;
export type Substrate = (typeof SUBSTRATES)[number];

/** Unit operations. These drive process-control checkpoints (D.*, E.1). */
export const PROCESSES = [
  'drying', 'milling', 'sieving', 'fermentation', 'roasting', 'frying',
  'cold-press', 'solvent-extraction', 'gelatinisation', 'extrusion', 'blending',
  'pasteurisation', 'filtration', 'saponification', 'compounding', 'filling',
  'dyeing', 'tanning', 'stitching', 'assembly', 'other',
] as const;
export type ProcessStep = (typeof PROCESSES)[number];

/**
 * Claims made ON THE LABEL. Deliberately distinct from what is true of the
 * product: the protocol's fortification checkpoints (A.5 / F.5 / H.4) fire on
 * the *claim*, because the offence is mislabelled nutrition — a fortified
 * product that says nothing is a different problem from a plain product that
 * claims fortification.
 */
export const LABEL_CLAIMS = [
  'fortified', 'organic', 'non-gmo', 'gluten-free', 'sugar-free', 'fair-trade',
  'geographic-indication', 'halal', 'kosher', 'vegan', 'no-preservatives',
  'health-benefit', 'weaning-infant', 'other',
] as const;
export type LabelClaim = (typeof LABEL_CLAIMS)[number];

/** The Codex/NAFDAC declarable allergen set. */
export const ALLERGENS = [
  'peanut', 'tree-nut', 'milk', 'soy', 'gluten', 'sesame', 'egg', 'shellfish',
  'fish', 'sulphite',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** Where the supplier intends to sell — drives export readiness (K.1, K.2). */
export const TARGET_MARKETS = ['domestic-NG', 'AfCFTA', 'EU', 'US-FDA', 'UK', 'other'] as const;
export type TargetMarket = (typeof TARGET_MARKETS)[number];

export const EXPORT_MARKETS: TargetMarket[] = ['AfCFTA', 'EU', 'US-FDA', 'UK'];

export const PACKAGING_TYPES = [
  'flexible-film', 'rigid-plastic', 'glass', 'metal-can', 'paper-carton',
  'woven-sack', 'jar', 'bottle', 'sachet', 'other',
] as const;
export type PackagingType = (typeof PACKAGING_TYPES)[number];

/**
 * The fact set. Every field is an enum or a boolean — never prose — because a
 * rule has to be able to ask a yes/no question of it.
 */
export interface AssessmentProfile {
  /** Taxonomy leaf that selects the category protocol (e.g. 'flour-staple'). */
  productClass: string;
  substrates: Substrate[];
  processes: ProcessStep[];
  labelClaims: LabelClaim[];
  allergensPresent: Allergen[];
  /** Allergen-bearing and allergen-free products sharing equipment. Escalates D.3. */
  sharedProductionLines: boolean;
  targetMarkets: TargetMarket[];
  packagingTypes: PackagingType[];
  /** Any step where product contacts metal — sieves, hammers, mills. Drives B.4/D.2. */
  metalContactSteps: boolean;
  /** Water as an ingredient or in cleaning of product-contact surfaces. Drives E.3. */
  waterUsedInProcess: boolean;

  /** Provenance, so we can tell a supplier-confirmed fact from an inferred one. */
  confirmedBySupplierAt?: string | null;
  /** Fields the supplier changed away from what we inferred — useful signal on
   *  how good the inference is, and worth reviewing before we trust it more. */
  correctedFields?: string[];
}

/** A profile with nothing asserted. Used as the base for inference. */
export function emptyProfile(productClass = 'unclassified'): AssessmentProfile {
  return {
    productClass,
    substrates: [],
    processes: [],
    labelClaims: [],
    allergensPresent: [],
    sharedProductionLines: false,
    targetMarkets: ['domestic-NG'],
    packagingTypes: [],
    metalContactSteps: false,
    waterUsedInProcess: false,
    confirmedBySupplierAt: null,
    correctedFields: [],
  };
}

/**
 * Flatten a profile into the fact set the rule engine reads.
 *
 * Kept as an explicit step rather than passing the profile directly, so that
 * rules address a stable vocabulary of fact names. When the profile shape
 * changes, this function absorbs it and the stored rules keep working — which
 * matters because rules are data written by the standards team, not code we can
 * refactor.
 */
export function profileToFacts(profile: AssessmentProfile): Record<string, unknown> {
  return {
    productClass: profile.productClass,
    substrates: profile.substrates,
    processes: profile.processes,
    labelClaims: profile.labelClaims,
    allergensPresent: profile.allergensPresent,
    sharedProductionLines: profile.sharedProductionLines,
    targetMarkets: profile.targetMarkets,
    packagingTypes: profile.packagingTypes,
    metalContactSteps: profile.metalContactSteps,
    waterUsedInProcess: profile.waterUsedInProcess,
    /** Convenience fact so export rules don't each restate the market list. */
    isExporting: profile.targetMarkets.some((m) => EXPORT_MARKETS.includes(m)),
  };
}
