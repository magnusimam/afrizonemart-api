import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import type { DiagnosticReport } from './report';
import type { Finding } from './findings';

/**
 * Drafting the authored passages of a diagnostic report.
 *
 * About 88% of the report is derived — the dashboard, findings tables, CAPA
 * tracker, roadmap and re-assessment conditions all fall out of the checkpoint
 * ratings with no authoring at all. What remains is roughly a thousand words
 * that a human genuinely wrote in every shipped report: the executive-summary
 * narrative, the headline findings, "what this means for the supplier", and the
 * §9 decision paragraph.
 *
 * This module drafts those four passages. It does not release them.
 *
 * THE REVIEW GATE IS THE POINT. A draft lands in `AuthoredSlot.draft` with
 * `approved` left false, and `unapprovedSlots()` blocks authorisation until a
 * human has read each one. These paragraphs tell a real business it has been
 * rejected; the model writes the first version, an auditor signs it.
 *
 * Failure is never fatal. If the key is unset, the call errors, or the request
 * is declined, the slots simply stay empty and the auditor writes them by hand
 * exactly as they do today. A report is never blocked by this being unavailable.
 */

const MODEL = env.ASSESSMENT_NARRATIVE_MODEL;

/** Deliberately generous: adaptive thinking shares this budget with the output,
 *  and ~1,000 words of prose is only a fraction of it. Comfortably under the
 *  SDK's HTTP timeout, so no streaming needed. */
const MAX_TOKENS = 16_000;

export interface NarrativeDrafts {
  outcomeReason: string;
  headlineFindings: string;
  whatThisMeans: string;
  decisionNarrative: string;
}

/** Cohort comparisons appear in every shipped report ("the lowest Minor count
 *  of any supplier in this cycle"). Without this the model must not make them. */
export interface CohortContext {
  cycleName: string;
  peers: { supplierName: string; score: number; critical: number; major: number; minor: number }[];
}

/**
 * The house style guide.
 *
 * Kept as one frozen constant, and placed first in the request, because prompt
 * caching is a prefix match: everything before the first volatile byte can be
 * cached. This block is identical for every supplier, so it is written once per
 * cache window and read at a tenth of the price on every report after.
 *
 * Do not interpolate anything into this string — a date, a supplier name, or a
 * report count in here would invalidate the cache on every single call.
 */
const HOUSE_STYLE = `You are drafting passages for an Afrizonemart Conformity Diagnostic Report:
the document a supplier receives after a facility assessment, telling them
whether their product has been cleared for listing.

Your drafts are reviewed and edited by the lead auditor before the report is
released. Write them as a competent colleague's first version, not as a
placeholder.

## What the report already contains

Everything factual is generated before you are called: the conformity matrix,
the findings tables, the CAPA tracker with owners and deadlines, the remediation
roadmap, and the re-assessment conditions. Do not restate them. Your passages
carry the judgement a table cannot: what the findings mean taken together, how
much work closure really represents, and how well placed this supplier is.

## The assessment model

Findings are rated Critical, Major, Minor or Observation.

A single Critical fails the assessment outright, regardless of score. This is
the fact suppliers most often misread, because the score can look strong: a
facility scoring 91/100 with two Criticals is rejected. When that is the case,
say so plainly and early.

Scores are indicative only: 100 minus roughly 2 points per Major and 0.5 per
Minor. Criticals and Observations carry no score weight — a Critical overrides
the outcome rather than reducing the number. No more than three Majors are
permitted for any approval outcome, conditional listings included.

## Voice

Write British English throughout: practised, formalise, programme, colour,
sulphite, gelatinisation. Never American spellings.

Be direct and specific. Name the checkpoint reference when you cite a finding.
Prefer concrete detail over adjectives: "no batch-level cyanide testing" beats
"significant quality gaps".

Never be accusatory, and never condescend. The pattern that works is:
acknowledge what the supplier already does well, name precisely what is
missing, then state the consequence. These are small businesses being told
their product cannot be listed; the report should read as a route forward.

When you explain a risk, close on the standard or the concrete consumer harm —
not on a general appeal to quality.

Do not pad. Every sentence should carry information the supplier could act on
or would be wrong without. No preamble, no summary of what you are about to
say, no restating the brief back.

Do not invent facts. Work only from the assessment data you are given. If you
do not have evidence for something, leave it out rather than hedging about it.

## What each passage must do

**outcomeReason** — One or two sentences, immediately under the outcome banner.
Name what drives the outcome, and where it is genuinely true, whether the
supplier is well placed for a fast re-assessment.

**headlineFindings** — Three to six bullets. Each begins with a bold label
(Critical, Major, Scope, Watch, Strength) then a colon and one sentence. Cover
every Critical, the most consequential Majors, and any scope or protocol-fit
concern. Include a Strength bullet where the evidence supports one.

**whatThisMeans** — Two paragraphs addressed to this supplier. First: what they
already do well, drawn from the compliant checkpoints. Second: what blocks
listing, how much work closure represents, and what happens next. This is the
part a supplier reads most closely.

**decisionNarrative** — One paragraph for the Final Decision section. What
drives the outcome, how the Major count compares against the maximum of three,
and an honest read on whether remediation is straightforward or substantial.
Where the barrier is procedural rather than structural, say so — it is usually
the most useful sentence in the report.`;

/** Four strings. Hand-written rather than generated from a validator so the
 *  descriptions the model reads are exactly the ones we intend. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    outcomeReason: { type: 'string', description: 'One or two sentences naming what drives the outcome.' },
    headlineFindings: { type: 'string', description: 'Three to six markdown bullets, each starting with a bold label.' },
    whatThisMeans: { type: 'string', description: 'Two paragraphs addressed to the supplier.' },
    decisionNarrative: { type: 'string', description: 'One paragraph for the Final Decision section.' },
  },
  required: ['outcomeReason', 'headlineFindings', 'whatThisMeans', 'decisionNarrative'],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Draft the four authored passages, or return null.
 *
 * Null is a normal outcome, not an error path: no API key configured, the model
 * declined, the call failed. The caller carries on with empty slots.
 */
export async function draftNarrative(
  report: DiagnosticReport,
  cohort?: CohortContext,
): Promise<NarrativeDrafts | null> {
  const anthropic = getClient();
  if (!anthropic) {
    logger.info('assessment.narrative.skipped', { reason: 'no_api_key' });
    return null;
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Let the model decide how much to think. These are judgement calls
      // about a rejection decision, so the depth is worth the latency.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      // Safety classifiers can decline a request; a decline is returned as a
      // normal 200 with stop_reason "refusal" rather than an error. Opting into
      // fallbacks means an otherwise-fine request isn't lost to a false
      // positive — plausible here, since the source material is full of
      // contamination, toxin and adulteration language.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        {
          type: 'text',
          text: HOUSE_STYLE,
          // Frozen prefix — written once per cache window, then read at a
          // tenth of the price for every subsequent report.
          cache_control: { type: 'ephemeral' },
        },
      ],
      // Everything volatile lives here, after the cache breakpoint.
      messages: [{ role: 'user', content: buildBrief(report, cohort) }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      logger.warn('assessment.narrative.refused', {
        supplier: report.meta.supplierSlug,
        category: response.stop_details?.category ?? null,
      });
      return null;
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      logger.warn('assessment.narrative.empty', { supplier: report.meta.supplierSlug });
      return null;
    }

    const drafts = parseDrafts(text.text);
    logger.info('assessment.narrative.drafted', {
      supplier: report.meta.supplierSlug,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      cachedTokens: response.usage.cache_read_input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    return drafts;
  } catch (error) {
    // Never let drafting break report generation. The auditor writes the
    // passages by hand, exactly as they do today.
    logger.error('assessment.narrative.failed', {
      supplier: report.meta.supplierSlug,
      error: describeError(error),
    });
    return null;
  }
}

/**
 * Fill a report's authored slots with drafts, leaving every one unapproved.
 *
 * Deliberately never sets `approved`. A drafted-but-unread passage must still
 * block release — that is what `unapprovedSlots()` checks, and it is the whole
 * reason this is a two-step process.
 */
export function applyDrafts(report: DiagnosticReport, drafts: NarrativeDrafts): void {
  report.executiveSummary.outcomeReason.draft = drafts.outcomeReason;
  report.executiveSummary.headlineFindings.draft = drafts.headlineFindings;
  report.executiveSummary.whatThisMeans.draft = drafts.whatThisMeans;
  report.decision.narrative.draft = drafts.decisionNarrative;
}

/**
 * The per-supplier brief.
 *
 * Assembled as compact structured text rather than raw JSON: the model reads
 * the assessment more reliably when findings are grouped by severity and the
 * auditor's own note sits next to the checkpoint it belongs to.
 */
function buildBrief(report: DiagnosticReport, cohort?: CohortContext): string {
  const { meta, executiveSummary: summary, findings } = report;
  const strip = summary.scoreStrip;

  const lines: string[] = [
    `SUPPLIER: ${meta.supplierName} — ${meta.productDescriptor}`,
    `PROTOCOL: ${meta.protocolCode} (${meta.protocolName})`,
    `ASSESSED: ${meta.issueDate}`,
    '',
    `OUTCOME: ${summary.outcomeLabel}`,
    `SCORE: ${strip.indicativeScore}/100 — ${strip.critical} Critical, ${strip.major} Major, `
      + `${strip.minor} Minor, ${strip.observation} Observation, ${strip.compliant} Compliant, `
      + `${strip.notApplicable} not applicable`,
    '',
  ];

  const section = (title: string, items: Finding[]) => {
    if (items.length === 0) return;
    lines.push(`${title} (${items.length}):`);
    for (const f of items) {
      lines.push(`  ${f.ref} — ${f.title}`);
      if (f.escalated) {
        lines.push('    escalated to Critical by a confirmed finding');
      }
      if (f.auditorNote) {
        // Quoted verbatim in the shipped reports' Evidence Basis, so it is
        // source material rather than an aside.
        lines.push(`    auditor noted: "${f.auditorNote}"`);
      }
      if (f.justification) {
        lines.push(`    severity justified: ${f.justification}`);
      }
    }
    lines.push('');
  };

  section('CRITICAL FINDINGS', findings.critical);
  section('MAJOR FINDINGS', findings.major);
  section('MINOR FINDINGS', findings.minor);
  section('OBSERVATIONS', findings.observation);

  if (report.complianceStrengths.length > 0) {
    lines.push(`VERIFIED COMPLIANT (${report.complianceStrengths.length}):`);
    for (const s of report.complianceStrengths) lines.push(`  ${s.ref} — ${s.text}`);
    lines.push('');
  }

  if (cohort && cohort.peers.length > 0) {
    lines.push(`ASSESSMENT CYCLE — ${cohort.cycleName}:`);
    for (const p of cohort.peers) {
      lines.push(`  ${p.supplierName}: ${p.score}/100, ${p.critical}C ${p.major}M ${p.minor}Mi`);
    }
    lines.push('You may compare this supplier against the cycle above.');
  } else {
    // Comparative superlatives are pervasive in the shipped reports and are
    // unverifiable without peer data — so forbid them rather than risk one.
    lines.push('No cohort data available. Do not make comparisons to other suppliers.');
  }

  lines.push('', 'Draft the four passages.');
  return lines.join('\n');
}

function parseDrafts(raw: string): NarrativeDrafts | null {
  try {
    const parsed = JSON.parse(raw) as Partial<NarrativeDrafts>;
    const keys = ['outcomeReason', 'headlineFindings', 'whatThisMeans', 'decisionNarrative'] as const;
    for (const key of keys) {
      if (typeof parsed[key] !== 'string' || !parsed[key]?.trim()) return null;
    }
    return parsed as NarrativeDrafts;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (error instanceof Anthropic.AuthenticationError) return 'bad_api_key';
  if (error instanceof Anthropic.APIConnectionError) return 'connection_failed';
  if (error instanceof Anthropic.APIError) return `api_error_${error.status}`;
  return error instanceof Error ? error.message : 'unknown';
}
