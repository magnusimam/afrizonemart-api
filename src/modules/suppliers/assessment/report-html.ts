import type { DashboardRow, Finding } from './findings';
import { ratingLabel } from './findings';
import type { CapaRow, DiagnosticReport } from './report';

/**
 * The Conformity Diagnostic Report, rendered to HTML.
 *
 * ONE RENDERER, TWO DESTINATIONS. This same markup is printed to PDF for the
 * email attachment and served to the supplier's portal. That is the entire
 * reason the PDF is produced by a headless browser rather than a PDF library:
 * a separate document definition would be a second layout to maintain, and it
 * would drift from the on-screen report within months. A supplier comparing the
 * attachment against the portal must see the same document.
 *
 * Self-contained by necessity — inline CSS, no external fonts, no images, no
 * scripts. It has to render identically in an offline print context and inside
 * whatever sanitiser the portal wraps it in.
 *
 * British spelling throughout, matching the shipped reports.
 */

/** Brand tokens, mirrored from the storefront's tailwind config so the report
 *  looks like Afrizonemart rather than like a different product. */
const C = {
  navy: '#000066',
  navyLight: '#E6E6F7',
  amber: '#FBAC34',
  amberLight: '#FEF3E2',
  charcoal: '#2C2C2C',
  muted: '#555555',
  border: '#E8E8E8',
  success: '#1A6B2E',
  danger: '#C0392B',
  major: '#E8590C',
  page: '#FFFFFF',
} as const;

const SEVERITY_COLOUR: Record<string, string> = {
  CRITICAL: C.danger,
  MAJOR: C.major,
  MINOR: '#8A6D1F',
  OBSERVATION: C.muted,
  COMPLIANT: C.success,
  'NOT APPLIC.': '#9A9A9A',
  'NOT RATED': C.muted,
};

export function renderReportHtml(report: DiagnosticReport): string {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<title>${esc(report.meta.documentCode)} — ${esc(report.meta.supplierName)}</title>
<style>${STYLES}</style>
</head><body>
${cover(report)}
${executiveSummary(report)}
${profile(report)}
${methodology(report)}
${dashboard(report)}
${findingsSection(report)}
${strengths(report)}
${roadmap(report)}
${capa(report)}
${decision(report)}
${signOff(report)}
</body></html>`;
}

/* ── Sections ─────────────────────────────────────────────────────────── */

function cover(r: DiagnosticReport): string {
  const m = r.meta;
  return `<header class="cover">
  <div class="masthead">AFRIZONEMART &nbsp;│&nbsp; STANDARDS &amp; QUALITY ASSURANCE</div>
  <div class="classification">CONFIDENTIAL · SUPPLIER DIAGNOSTIC REPORT</div>
  <h1>Product Conformity<br>&amp; Supplier Readiness<br>Diagnostic Assessment</h1>
  <div class="prepared-for">PREPARED FOR</div>
  <div class="supplier-name">${esc(m.supplierName)}</div>
  <div class="descriptor">${esc(m.productDescriptor)}</div>
  ${kv([
    ['Document Code', m.documentCode],
    ['Assessment Protocol', `${m.protocolName} (v${m.protocolVersion})`],
    ['Assessment Type', m.assessmentType],
    ['Report Version', m.reportVersion],
    ['Issue Date', m.issueDate],
    ['Classification', m.classification],
  ])}
  <div class="prepared-by">Prepared by ${esc(m.preparedBy)} · Not for Public Distribution</div>
</header>`;
}

function executiveSummary(r: DiagnosticReport): string {
  const s = r.executiveSummary;
  const t = s.scoreStrip;
  const tone = s.outcome === 'APPROVED' ? 'ok' : s.outcome === 'PROVISIONAL' ? 'warn' : 'bad';
  return `<section class="section">
  <h2>Executive Summary</h2>
  <div class="banner ${tone}">
    <div class="banner-label">ASSESSMENT OUTCOME</div>
    <div class="banner-value">${esc(s.outcomeLabel)}</div>
    ${authored(s.outcomeReason, 'banner-reason')}
  </div>
  <div class="score-strip">
    <div class="score"><strong>${t.indicativeScore}</strong> / 100<span>Indicative Score</span></div>
    ${count('Critical', t.critical, C.danger)}
    ${count('Major', t.major, C.major)}
    ${count('Minor', t.minor, '#8A6D1F')}
    ${count('Observation', t.observation, C.muted)}
    ${count('Compliant', t.compliant, C.success)}
    ${count('Not applicable', t.notApplicable, '#9A9A9A')}
  </div>
  <div class="note"><strong>Note</strong> ${esc(s.methodologyNote)}</div>
  ${authoredBlock('Headline Findings', s.headlineFindings)}
  ${authoredBlock(`What This Means for ${r.meta.supplierName}`, s.whatThisMeans)}
</section>`;
}

function profile(r: DiagnosticReport): string {
  const m = r.meta;
  return `<section class="section">
  <h2>1. Supplier &amp; Assessment Profile</h2>
  ${table(['Field', 'Detail'], [
    ['Supplier', esc(m.supplierName)],
    ['Products in scope', esc(m.productDescriptor)],
    ['Protocol applied', `${esc(m.protocolCode)} — ${esc(m.protocolName)}`],
    ['Protocol version', esc(m.protocolVersion)],
    ['Assessment type', esc(m.assessmentType)],
    ['Report issued', esc(m.issueDate)],
  ].map((row) => row))}
</section>`;
}

function methodology(r: DiagnosticReport): string {
  const m = r.methodology;
  return `<section class="section">
  <h2>2. Assessment Methodology</h2>
  <p>${esc(m.intro)}</p>
  <h3>Risk-Based Scoring Legend</h3>
  ${table(['Severity', 'Score Weight', 'Definition &amp; Required Action'],
    m.scoringLegend.map((l) => [esc(l.severity), esc(l.weight), esc(l.definition)]))}
  <div class="arithmetic"><strong>How this score was calculated.</strong> ${esc(m.workedArithmetic)}</div>
</section>`;
}

function dashboard(r: DiagnosticReport): string {
  const rows = r.dashboard.map((row: DashboardRow) => {
    const label = ratingLabel(row.rating);
    const colour = SEVERITY_COLOUR[label] ?? C.muted;
    const status = row.notApplicableBecause
      ? `Not assessed — ${esc(row.notApplicableBecause)}`
      : esc(row.statusNote);
    return [
      `<span class="ref">${esc(row.ref)}</span>`,
      esc(row.text) || '<span class="dim">—</span>',
      `<span class="pill" style="color:${colour};border-color:${colour}">${esc(label)}</span>`,
      status || '<span class="dim">—</span>',
    ];
  });
  return `<section class="section">
  <h2>3. Findings Dashboard</h2>
  <p>Every checkpoint in the protocol is listed below. Checkpoints marked
  <em>Not applicable</em> did not apply to this product; the reason each was
  excluded is stated so the scope of the assessment is fully visible.</p>
  ${table(['Ref', 'Checkpoint', 'Rating', 'Status'], rows, 'matrix')}
</section>`;
}

function findingsSection(r: DiagnosticReport): string {
  const f = r.findings;
  const parts = [`<section class="section"><h2>4. Detailed Findings &amp; Gap Analysis</h2><p>${esc(f.intro)}</p>`];

  if (f.critical.length) {
    parts.push(`<h3>4.1 Critical Findings (${f.critical.length})</h3>`);
    parts.push(f.critical.map((x) => card(x, 'CRITICAL')).join(''));
  }
  if (f.major.length) {
    parts.push(`<h3>4.2 Major Findings (${f.major.length})</h3>`);
    parts.push(f.majorsAsCards
      ? f.major.map((x) => card(x, 'MAJOR')).join('')
      : findingTable(f.major, 'Risk &amp; Required Closure'));
  }
  if (f.minor.length) {
    parts.push(`<h3>4.3 Minor Findings (${f.minor.length})</h3>`);
    parts.push(findingTable(f.minor, 'Required Closure'));
  }
  if (f.observation.length) {
    parts.push(`<h3>4.4 Observations (${f.observation.length})</h3>`);
    parts.push(findingTable(f.observation, 'Suggested Action'));
  }
  if (!f.critical.length && !f.major.length && !f.minor.length && !f.observation.length) {
    parts.push('<p class="dim">No findings were recorded — every applicable checkpoint was rated Compliant.</p>');
  }
  parts.push('</section>');
  return parts.join('');
}

function card(f: Finding, severity: string): string {
  const colour = SEVERITY_COLOUR[severity] ?? C.muted;
  const escalation = f.escalated
    ? '<p class="escalated">Escalated to Critical under the Red Flag protocol: a confirmed finding was recorded against this checkpoint.</p>'
    : '';
  const evidence = f.auditorNote
    ? `<div class="field"><span>Evidence Basis</span><p>Assessor field note: &ldquo;${esc(f.auditorNote)}&rdquo;</p></div>`
    : '';
  const justification = f.justification
    ? `<div class="field"><span>Severity Rationale</span><p>${esc(f.justification)}</p></div>`
    : '';
  return `<div class="card" style="border-left-color:${colour}">
  <div class="card-head" style="color:${colour}">${esc(severity)} &nbsp;|&nbsp; ${esc(f.ref)} · ${esc(f.title)}</div>
  ${escalation}
  <div class="field"><span>Required Closure</span><p>${esc(f.requiredClosure)}</p></div>
  ${justification}
  ${evidence}
  <div class="field"><span>Accountability</span><p>${esc(f.ownerDept)} — due within ${f.deadlineDays} days (${esc(f.dueDate)})</p></div>
</div>`;
}

function findingTable(findings: Finding[], actionHeader: string): string {
  return table(['Ref', 'Finding', actionHeader], findings.map((f) => [
    `<span class="ref">${esc(f.ref)}</span>`,
    esc(f.title) + (f.auditorNote ? `<br><span class="dim">Assessor note: &ldquo;${esc(f.auditorNote)}&rdquo;</span>` : ''),
    esc(f.requiredClosure),
  ]));
}

function strengths(r: DiagnosticReport): string {
  if (r.complianceStrengths.length === 0) return '';
  return `<section class="section">
  <h2>5. Compliance Strengths</h2>
  <p>The following checkpoints were verified as fully compliant with objective
  evidence on file.</p>
  ${table(['Ref', 'Verified control'],
    r.complianceStrengths.map((s) => [`<span class="ref">${esc(s.ref)}</span>`, esc(s.text)]))}
</section>`;
}

function roadmap(r: DiagnosticReport): string {
  if (r.roadmap.length === 0) return '';
  const phases = r.roadmap.map((p) => `<div class="phase">
  <h3>${esc(p.label)}</h3>
  <ul>${p.findings.map((f) => `<li><strong>${esc(f.ref)}</strong> — ${esc(f.requiredClosure)}</li>`).join('')}</ul>
</div>`).join('');
  return `<section class="section">
  <h2>7. Recommendations &amp; Remediation Roadmap</h2>
  <p>Phases run concurrently from the day this report is issued. Each phase
  closes at the deadline attached to that severity.</p>
  ${phases}
</section>`;
}

function capa(r: DiagnosticReport): string {
  if (r.capa.rows.length === 0) return '';
  const rows = r.capa.rows.map((row: CapaRow) => [
    `<span class="ref">${esc(row.ref)}</span>`,
    `<span class="pill" style="color:${SEVERITY_COLOUR[row.severity.toUpperCase()] ?? C.muted}">${esc(row.severity)}</span>`,
    esc(row.nonConformity),
    esc(row.owner),
    `${row.deadlineDays} days<br><span class="dim">${esc(row.dueDate)}</span>`,
    '<span class="blank"></span>',
    '<span class="blank"></span>',
  ]);
  return `<section class="section">
  <h2>8. Corrective &amp; Preventive Action (CAPA) Plan</h2>
  <p>${esc(r.capa.intro)}</p>
  ${table(['Ref', 'Severity', 'Corrective Action', 'Owner / Dept.', 'Deadline', 'Root Cause', 'Evidence'], rows, 'capa')}
</section>`;
}

function decision(r: DiagnosticReport): string {
  const d = r.decision;
  return `<section class="section">
  <h2>9. Final Decision &amp; Re-Assessment Path</h2>
  <div class="decision-banner">${esc(d.banner)}</div>
  ${authored(d.narrative, 'decision-narrative')}
  <h3>Path Forward</h3>
  ${table(['Milestone', 'Owner', 'Action'],
    d.milestones.map((m) => [esc(m.day), esc(m.owner), esc(m.action)]))}
  <h3>Conditions for Re-Assessment Approval</h3>
  <ol class="conditions">${d.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
</section>`;
}

function signOff(r: DiagnosticReport): string {
  return `<section class="section">
  <h2>11. Report Acknowledgement &amp; Sign-Off</h2>
  <p>${esc(r.signOff.statement)}</p>
  <div class="signatures">
    ${r.signOff.blocks.map((b) => `<div class="sig"><div class="sig-line"></div><div class="sig-role">${esc(b)}</div><div class="sig-date">Date: ______________</div></div>`).join('')}
  </div>
  <footer class="doc-footer">${esc(r.meta.documentCode)} · ${esc(r.meta.classification)}</footer>
</section>`;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Render an authored passage.
 *
 * An unapproved slot is rendered as a visible placeholder rather than silently
 * omitted. A report cannot be authorised with one outstanding, so if this ever
 * appears in a generated document it means something skipped the review gate —
 * and it should be obvious on the page, not invisible.
 */
function authored(slot: { draft: string; approved: boolean }, cls: string): string {
  if (slot.approved && slot.draft.trim()) {
    return `<div class="${cls}">${paragraphs(slot.draft)}</div>`;
  }
  return `<div class="${cls} pending">[Awaiting auditor review — this passage has not been approved for release.]</div>`;
}

function authoredBlock(heading: string, slot: { draft: string; approved: boolean }): string {
  return `<h3>${esc(heading)}</h3>${authored(slot, 'authored')}`;
}

/** Minimal markdown: paragraphs, `- ` bullets, and **bold**. The authored
 *  passages are prose, not a document format — anything richer invites the
 *  drafting step to emit layout we would then have to sanitise. */
function paragraphs(text: string): string {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => l.startsWith('- ') || l.startsWith('* '))) {
      return `<ul>${lines.map((l) => `<li>${bold(esc(l.slice(2)))}</li>`).join('')}</ul>`;
    }
    return `<p>${bold(esc(lines.join(' ')))}</p>`;
  }).join('');
}

function bold(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function count(label: string, n: number, colour: string): string {
  return `<div class="count"><strong style="color:${colour}">${n}</strong><span>${esc(label)}</span></div>`;
}

function kv(pairs: [string, string][]): string {
  return `<dl class="meta">${pairs.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

/** Cells are pre-escaped by callers so they can embed spans; never pass raw
 *  supplier input straight in. */
function table(headers: string[], rows: string[][], cls = ''): string {
  return `<table class="${cls}"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Every dynamic value passes through here. Supplier names, auditor notes and
 *  model-drafted prose are all untrusted as markup. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { margin:0; background:${C.page}; color:${C.charcoal};
  font-family: Georgia, 'Times New Roman', serif; font-size:10.5pt; line-height:1.55; }
h1 { font-family: Helvetica, Arial, sans-serif; font-size:26pt; line-height:1.15;
  color:${C.navy}; margin:18px 0 24px; font-weight:700; letter-spacing:-0.5px; }
h2 { font-family: Helvetica, Arial, sans-serif; font-size:14pt; color:${C.navy};
  margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid ${C.navy}; }
h3 { font-family: Helvetica, Arial, sans-serif; font-size:11pt; color:${C.navy}; margin:18px 0 8px; }
p { margin:0 0 10px; }
.dim { color:${C.muted}; font-size:9pt; }
.section { margin:0 0 26px; page-break-inside:auto; }
.section h2 { page-break-after:avoid; }

.cover { border-bottom:3px solid ${C.navy}; padding-bottom:20px; margin-bottom:26px; }
.masthead { font-family:Helvetica,Arial,sans-serif; font-size:8pt; letter-spacing:1.5px;
  color:${C.navy}; font-weight:700; }
.classification { font-family:Helvetica,Arial,sans-serif; font-size:7.5pt; letter-spacing:1px;
  color:${C.muted}; margin-top:3px; }
.prepared-for { font-family:Helvetica,Arial,sans-serif; font-size:7.5pt; letter-spacing:1.5px;
  color:${C.muted}; margin-top:14px; }
.supplier-name { font-family:Helvetica,Arial,sans-serif; font-size:19pt; font-weight:700;
  color:${C.charcoal}; margin-top:2px; }
.descriptor { color:${C.muted}; font-style:italic; margin-bottom:16px; }
.meta { display:grid; grid-template-columns:1fr 1fr; gap:4px 24px; margin:0 0 14px; font-size:9pt; }
.meta div { display:flex; gap:8px; border-bottom:1px dotted ${C.border}; padding:3px 0; }
.meta dt { font-family:Helvetica,Arial,sans-serif; color:${C.muted}; min-width:120px; }
.meta dd { margin:0; font-weight:600; }
.prepared-by { font-size:8pt; color:${C.muted}; font-style:italic; }

.banner { border-left:5px solid ${C.danger}; background:#FBEEEC; padding:12px 14px; margin-bottom:14px; }
.banner.ok { border-left-color:${C.success}; background:#EDF6EF; }
.banner.warn { border-left-color:${C.amber}; background:${C.amberLight}; }
.banner-label { font-family:Helvetica,Arial,sans-serif; font-size:7.5pt; letter-spacing:1.2px; color:${C.muted}; }
.banner-value { font-family:Helvetica,Arial,sans-serif; font-size:14pt; font-weight:700; color:${C.charcoal}; }
.banner-reason { margin-top:6px; }
.banner-reason p { margin:0; }

.score-strip { display:flex; flex-wrap:wrap; gap:0; border:1px solid ${C.border};
  margin-bottom:14px; page-break-inside:avoid; }
.score, .count { flex:1; min-width:80px; padding:9px 10px; border-right:1px solid ${C.border}; text-align:center; }
.score { background:${C.navyLight}; }
.score strong { font-family:Helvetica,Arial,sans-serif; font-size:17pt; color:${C.navy}; }
.count strong { font-family:Helvetica,Arial,sans-serif; font-size:14pt; display:block; }
.score span, .count span { display:block; font-family:Helvetica,Arial,sans-serif;
  font-size:7pt; letter-spacing:0.6px; color:${C.muted}; text-transform:uppercase; }

.note { background:#FAFAFA; border:1px solid ${C.border}; padding:10px 12px; margin-bottom:14px; font-size:10pt; }
.arithmetic { background:${C.navyLight}; border-left:4px solid ${C.navy}; padding:10px 12px; margin-top:12px; }
.authored p:last-child, .decision-narrative p:last-child { margin-bottom:0; }
.pending { color:${C.danger}; font-style:italic; background:#FBEEEC; padding:8px 10px; border:1px dashed ${C.danger}; }

table { width:100%; border-collapse:collapse; margin:0 0 12px; font-size:9pt; }
th { background:${C.navy}; color:#fff; font-family:Helvetica,Arial,sans-serif; font-size:7.5pt;
  letter-spacing:0.5px; text-align:left; padding:6px 8px; text-transform:uppercase; }
td { border-bottom:1px solid ${C.border}; padding:6px 8px; vertical-align:top; }
tr { page-break-inside:avoid; }
.ref { font-family:Helvetica,Arial,sans-serif; font-weight:700; color:${C.navy}; white-space:nowrap; }
.pill { display:inline-block; font-family:Helvetica,Arial,sans-serif; font-size:7pt; font-weight:700;
  letter-spacing:0.5px; border:1px solid currentColor; border-radius:9px; padding:1px 7px; white-space:nowrap; }
.matrix td:nth-child(2) { width:46%; }
.capa td:nth-child(3) { width:32%; }
.blank { display:block; min-height:22px; border-bottom:1px dotted ${C.border}; }

.card { border:1px solid ${C.border}; border-left-width:5px; padding:11px 13px; margin-bottom:11px;
  page-break-inside:avoid; }
.card-head { font-family:Helvetica,Arial,sans-serif; font-size:10pt; font-weight:700; margin-bottom:8px; }
.field { margin-bottom:7px; }
.field span { display:block; font-family:Helvetica,Arial,sans-serif; font-size:7.5pt;
  letter-spacing:0.6px; color:${C.muted}; text-transform:uppercase; }
.field p { margin:1px 0 0; }
.escalated { background:#FBEEEC; border-left:3px solid ${C.danger}; padding:6px 9px; font-size:9pt; }

.phase { border-left:3px solid ${C.amber}; padding-left:12px; margin-bottom:14px; page-break-inside:avoid; }
.phase ul, .conditions { margin:4px 0 0; padding-left:20px; }
.phase li, .conditions li { margin-bottom:4px; }
.decision-banner { background:${C.navy}; color:#fff; font-family:Helvetica,Arial,sans-serif;
  font-size:10.5pt; font-weight:700; padding:11px 14px; margin-bottom:12px; }

.signatures { display:flex; gap:22px; margin-top:22px; page-break-inside:avoid; }
.sig { flex:1; }
.sig-line { border-bottom:1px solid ${C.charcoal}; height:34px; }
.sig-role { font-family:Helvetica,Arial,sans-serif; font-size:8pt; color:${C.muted}; margin-top:4px; }
.sig-date { font-size:8pt; color:${C.muted}; margin-top:8px; }
.doc-footer { margin-top:26px; padding-top:8px; border-top:1px solid ${C.border};
  font-size:7.5pt; color:${C.muted}; text-align:center; }
`;
