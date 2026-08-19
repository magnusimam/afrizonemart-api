"""
Extract Afrizonemart conformity diagnostic reports (.docx) into JSON.

    python scripts/extract-diagnostic-reports.py "<folder>" [-o out.json]

These reports were written by the QA team in Word before the portal could
generate them. The assessment engine now produces the same document from
structured data, so this is a BACKFILL: it recovers the findings already
delivered to suppliers so their portal shows the report they were sent.

A .docx is a zip holding word/document.xml. No dependency is needed to read
it, which matters for a script that has to run on whatever machine has the
files.

The one real trap: `<w:t>` is a prefix of `<w:tbl>`, `<w:tc>`, `<w:tcPr>`.
Matching `<w:t[^>]*>` silently captures table-cell *properties* as if they
were text, which yields cells full of `<w:tcW w:type="dxa">`. The text
element must be matched as `<w:t>` or `<w:t ...>` and nothing else.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

# `<w:t>` or `<w:t xml:space="preserve">`, never `<w:tbl>`/`<w:tc>`/`<w:tcPr>`.
T = re.compile(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', re.S)
CELL = re.compile(r'<w:tc(?:\s[^>]*)?>(.*?)</w:tc>', re.S)
ROW = re.compile(r'<w:tr(?:\s[^>]*)?>(.*?)</w:tr>', re.S)
PARA = re.compile(r'<w:p(?:\s[^>]*)?>(.*?)</w:p>', re.S)
CHECKPOINT = re.compile(r'^[A-L]\.\d{1,2}$')

ENT = [('&amp;', '&'), ('&apos;', "'"), ('&quot;', '"'), ('&lt;', '<'), ('&gt;', '>')]


def clean(s: str) -> str:
    for a, b in ENT:
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def text_of(fragment: str) -> str:
    return clean(''.join(T.findall(fragment)))


def paragraphs(xml: str):
    return [t for t in (text_of(p) for p in PARA.findall(xml)) if t]


def rows(xml: str):
    out = []
    for tr in ROW.findall(xml):
        cells = [text_of(tc) for tc in CELL.findall(tr)]
        if any(cells):
            out.append(cells)
    return out


# Report vocabulary → the rating codes the portal stores.
RATING = {
    'COMPLIANT': 'Cpt',
    'CRITICAL': 'C',
    'MAJOR': 'M',
    'MINOR': 'Mi',
    'OBSERVATION': 'O',
    'NOT APPLIC.': 'NA',
    'NOT APPLICABLE': 'NA',
    'N/A': 'NA',
}


def parse(path: Path) -> dict:
    xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf8', 'ignore')
    ps = paragraphs(xml)
    rs = rows(xml)

    doc = {'file': path.name}

    # ── header block ────────────────────────────────────────────────────
    # Prefer the "CODE / DR-COMPANY-001" header line, but fall back to the first
    # protocol code appearing anywhere: a few reports carry it only in the body.
    m = next((t for t in ps if re.match(r'^AFZ-QA-[A-Z]+-\d+\s*/', t)), None)
    if m:
        parts = [p.strip() for p in m.split('/')]
        doc['protocolCode'] = parts[0]
        doc['documentCode'] = parts[1] if len(parts) > 1 else None
    else:
        anywhere = next(
            (
                mm.group(0)
                for t in ps
                if (mm := re.search(r'AFZ-QA-[A-Z]+-\d+', t))
            ),
            None,
        )
        doc['protocolCode'] = anywhere
        doc['documentCode'] = None

    # "PREPARED FOR" is followed by the company name.
    if 'PREPARED FOR' in ps:
        i = ps.index('PREPARED FOR')
        doc['company'] = ps[i + 1] if i + 1 < len(ps) else None
        doc['descriptor'] = ps[i + 2] if i + 2 < len(ps) else None

    doc['protocolName'] = next(
        (ps[i + 1] for i, t in enumerate(ps) if t == 'Assessment Protocol' and i + 1 < len(ps)),
        None,
    )
    doc['issueDate'] = next(
        (ps[i + 1] for i, t in enumerate(ps) if t == 'Issue Date' and i + 1 < len(ps)), None
    )

    # ── outcome and score ───────────────────────────────────────────────
    doc['outcomeText'] = next(
        (t for t in ps if re.match(r'^(REJECTED|APPROVED|CONDITIONAL|PROVISIONAL)', t.upper())),
        None,
    )
    if doc['outcomeText']:
        doc['outcome'] = doc['outcomeText'].split('—')[0].split('-')[0].strip().upper()

    # Scores carry a half point: an odd number of Minor findings lands on .5,
    # which is why the schema stores a float. Matching integers only silently
    # dropped the score on every report that had one.
    score = next(
        (t for t in ps if re.fullmatch(r'\d{1,3}(?:\.\d+)?\s*/\s*100', t)), None
    )
    if score:
        doc['indicativeScore'] = float(score.split('/')[0].strip())

    # ── finding counts: a number paragraph followed by its label ────────
    counts = {}
    labels = {'Critical': 'critical', 'Major': 'major', 'Minor': 'minor',
              'Observation': 'observation'}
    for i, t in enumerate(ps):
        if t in labels and i > 0 and re.fullmatch(r'\d{1,3}', ps[i - 1]):
            counts.setdefault(labels[t], int(ps[i - 1]))
    doc['counts'] = counts

    # ── narrative ───────────────────────────────────────────────────────
    def section(title, stop_titles, limit=6):
        if title not in ps:
            return None
        i = ps.index(title)
        body = []
        for t in ps[i + 1:]:
            if t in stop_titles or re.match(r'^\d+\.\s', t):
                break
            body.append(t)
            if len(body) >= limit:
                break
        return ' '.join(body) or None

    doc['executiveSummary'] = section(
        'Executive Summary', {'ASSESSMENT OUTCOME', 'Headline Findings'}, 3
    )
    doc['whatThisMeans'] = next(
        (section(t, {'Scope', 'Headline Findings'}, 6) for t in ps if t.startswith('What This Means')),
        None,
    )

    # Headline findings: a severity word paragraph followed by the finding.
    heads = []
    if 'Headline Findings' in ps:
        i = ps.index('Headline Findings')
        for j in range(i + 1, min(i + 30, len(ps))):
            if ps[j] in ('Urgent', 'Critical', 'Major', 'Minor') and j + 1 < len(ps):
                nxt = ps[j + 1]
                if len(nxt) > 25:
                    heads.append({'severity': ps[j], 'finding': nxt})
            if ps[j].startswith('Scope') or ps[j].startswith('What This Means'):
                break
    doc['headlineFindings'] = heads

    # ── checkpoint matrix ───────────────────────────────────────────────
    # Two different tables key their rows on the same checkpoint refs: the
    # rating matrix (Ref | Requirement | RATING | Status) and the corrective
    # action plan (Ref | Finding | Action | Timeline). Telling them apart by
    # position is unreliable, so classify on the rating vocabulary — a cell
    # that is a known rating is a matrix row, anything else is CAPA.
    responses = {}
    capa = []
    for r in rs:
        if len(r) < 3 or not CHECKPOINT.match(r[0]):
            continue
        ref = r[0]
        code = RATING.get(r[2].upper().strip())
        if code is not None:
            entry = {'rating': code}
            if len(r) > 3 and r[3]:
                entry['statusNote'] = r[3]
            if r[1]:
                entry['requirement'] = r[1]
            responses[ref] = entry
        else:
            item = {'ref': ref, 'finding': r[1], 'action': r[2]}
            if len(r) > 3 and r[3]:
                item['timeline'] = r[3]
            capa.append(item)

    doc['responses'] = responses
    doc['checkpointCount'] = len(responses)
    doc['capa'] = capa
    doc['capaCount'] = len(capa)
    return doc



# ---- PDF reports -----------------------------------------------------
#
# One report in the first cohort was issued as a PDF rather than .docx. A PDF
# carries no table structure, only positioned text, so the checkpoint matrix is
# recovered by pattern rather than by cell.
#
# Counts are computed from the recovered ratings instead of scraped from the
# summary panel. Scraping that panel missed a Critical finding the matrix
# plainly showed, and a report that under-states its own criticals is worse
# than one that fails to import.
PDF_ROW = re.compile(
    r'([A-L]\.\d{1,2})\s+(.{10,120}?)\s+'
    r'(COMPLIANT|CRITICAL|MAJOR|MINOR|OBSERVATION|NOT APPLIC\.?)',
)


def parse_pdf(path):
    try:
        import PyPDF2
    except ImportError:
        print(f'  skip  {path.name} (PyPDF2 not installed)')
        return None

    reader = PyPDF2.PdfReader(str(path))
    flat = re.sub(r'\s+', ' ', ' '.join((pg.extract_text() or '') for pg in reader.pages))

    doc = {'file': path.name, 'sourceFormat': 'pdf'}

    m = re.search(r'(AFZ-QA-[A-Z]+-\d+)\s*/\s*(DR-[A-Z0-9-]+)', flat)
    if m:
        doc['protocolCode'], doc['documentCode'] = m.group(1), m.group(2)

    m = re.search(r'PREPARED FOR\s+(.{3,60}?)\s+(?:Manufacturer|Producer|Packager|DOCUMENT)', flat)
    if m:
        doc['company'] = m.group(1).strip()

    m = re.search(r'ASSESSMENT PROTOCOL\s+(.{5,70}?)\s+ASSESSMENT TYPE', flat)
    if m:
        doc['protocolName'] = m.group(1).strip()

    m = re.search(r'ISSUE DATE\s+(\d{1,2} \w+ \d{4})', flat)
    if m:
        doc['issueDate'] = m.group(1)

    m = re.search(r'\b(REJECTED|APPROVED|CONDITIONAL)\b', flat)
    if m:
        doc['outcomeText'] = m.group(1)
        doc['outcome'] = m.group(1).upper()

    m = re.search(r'(\d{1,3}(?:\.\d)?)\s*/\s*100', flat)
    if m:
        doc['indicativeScore'] = float(m.group(1))

    responses = {}
    for ref, requirement, rating in PDF_ROW.findall(flat):
        code = RATING.get(rating.upper()) or RATING.get(rating.upper().rstrip('.'))
        if code is None:
            continue
        responses[ref] = {'rating': code, 'requirement': requirement.strip()}
    doc['responses'] = responses
    doc['checkpointCount'] = len(responses)

    vals = [r['rating'] for r in responses.values()]
    doc['counts'] = {
        'critical': vals.count('C'),
        'major': vals.count('M'),
        'minor': vals.count('Mi'),
        'observation': vals.count('O'),
        'compliant': vals.count('Cpt'),
        'na': vals.count('NA'),
    }

    m = re.search(r'Executive Summary\s+(.{80,900}?)(?:ASSESSMENT OUTCOME|Headline Findings)', flat)
    doc['executiveSummary'] = m.group(1).strip() if m else None
    doc['whatThisMeans'] = None
    doc['headlineFindings'] = []
    doc['capa'] = []
    doc['capaCount'] = 0
    return doc

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    folder = Path(sys.argv[1])
    out_path = Path('data/imports/diagnostic-reports.json')
    if '-o' in sys.argv:
        out_path = Path(sys.argv[sys.argv.index('-o') + 1])

    docs = []
    # PDFs as well as .docx: one report in the first cohort was issued as a PDF.
    candidates = sorted(list(folder.rglob('*.docx')) + list(folder.rglob('*.pdf')))
    for f in candidates:
        # Word lock files (~$Name.docx) are not documents.
        if f.name.startswith('~$'):
            continue
        try:
            d = parse_pdf(f) if f.suffix.lower() == '.pdf' else parse(f)
            if d is None:
                continue
        except Exception as e:  # noqa: BLE001 - report and continue
            print(f'  FAIL  {f.name}: {e}')
            continue
        # The cohort executive summary is not a per-supplier report.
        if not d.get('responses'):
            print(f'  skip  {f.name} (no checkpoint matrix — cohort summary?)')
            continue
        docs.append(d)
        print(
            f"  ok    {d.get('company') or f.stem:<38} "
            f"{d.get('protocolCode') or '?':<16} "
            f"score={d.get('indicativeScore') or '?':<4} "
            f"checkpoints={d['checkpointCount']:<4} "
            f"counts={d.get('counts')}"
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(docs, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\n{len(docs)} report(s) -> {out_path}')


if __name__ == '__main__':
    main()
