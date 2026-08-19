/**
 * Upload the issued diagnostic report documents to R2 and link them to audits.
 *
 *   npx tsx scripts/upload-audit-reports.ts "<folder>"            # dry run
 *   npx tsx scripts/upload-audit-reports.ts "<folder>" --commit
 *
 * The supplier must be able to download exactly the document that was signed.
 * The portal can re-render a report from the stored findings, but a re-render
 * is not the artefact the QA team issued, and for a document that decides
 * whether a business can list, "close enough" is not good enough.
 *
 * On the URL being public:
 *
 * These reports are classified "Confidential — Restricted Distribution" and
 * contain findings a competitor would find valuable. The bucket is served
 * publicly, so the only protection on the object itself is that its key cannot
 * be guessed — hence a random 32-hex prefix per file rather than the company
 * name. The URL is then handed out only to the authenticated supplier who owns
 * the audit, and to admins.
 *
 * That is obscurity, not access control: anyone who obtains the URL can read
 * the file. It is a deliberate trade for launch. The durable fix is to stream
 * the object through an authenticated API route and keep the bucket private —
 * worth doing before this pattern is used for anything more sensitive.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { env } from '@/config/env';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
// argv[0]=node, argv[1]=this script. Anything after that which is not a flag
// is the folder. Matching on a name pattern instead caught the script path.
const folderArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

/**
 * Report file → the supplier account it belongs to.
 *
 * Deliberately explicit. Filenames are inconsistent ("- Copy", "(1)", varying
 * company spellings) and attaching one supplier's confidential audit to another
 * supplier's dashboard is the single worst outcome here, so every pairing is
 * written down and reviewable rather than inferred.
 */
const FILE_TO_EMAIL: Record<string, string> = {
  Sheacoco: 'sheacocointernational@gmail.com',
  Avis_Foods: 'goretylux77@gmail.com',
  Eden_Foods: 'edenwholefoodsng@gmail.com',
  JVV_Foods: 'jvvfoodltd@gmail.com',
  Kayplan: 'kike@steerfornewbor.org',
  Matma_Cold_Pressed_Oils: 'matmafoods01@gmail.com',
  Oluwatoyin_Integrated_Farms: 'oluwatoyinintegratedfarms@gmail.com',
  PP_Foods: 'ppinternationalfoods@gmail.com',
  USEDIAMEG: 'usefoods2@gmail.com',
  Varli: 'varlifoods@gmail.com',
  Amineru: 'aminerunigent@yahoo.com',
};

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function emailFor(filename: string): string | null {
  for (const [prefix, email] of Object.entries(FILE_TO_EMAIL)) {
    if (filename.toLowerCase().startsWith(prefix.toLowerCase())) return email;
  }
  return null;
}

/** A clean download name — the supplier should not receive "- Copy (1).docx". */
function downloadName(company: string, ext: string): string {
  const slug = company
    .replace(/[^A-Za-z0-9 &]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `Afrizonemart-Conformity-Diagnostic-Report-${slug}${ext}`;
}

async function main() {
  const folder = folderArg ?? 'C:/Users/USER/AZM/afrizonemart-v2/OneDrive_2026-08-18';
  if (!fs.existsSync(folder)) {
    console.error(`No folder at ${folder}`);
    process.exit(1);
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(docx|pdf)$/i.test(e.name) && !e.name.startsWith('~$')) files.push(full);
    }
  };
  walk(folder);

  const plan: {
    file: string;
    email: string;
    supplierId: string;
    company: string;
    key: string;
    url: string;
    name: string;
    type: string;
    size: number;
  }[] = [];
  const skipped: string[] = [];

  for (const f of files.sort()) {
    const base = path.basename(f);
    const email = emailFor(base);
    if (!email) {
      skipped.push(`${base}  — no supplier mapping`);
      continue;
    }
    const supplier = await prisma.supplierProfile.findFirst({
      where: { user: { email } },
      include: { user: { select: { email: true } } },
    });
    if (!supplier) {
      skipped.push(`${base}  — no account for ${email}`);
      continue;
    }
    const audit = await prisma.supplierAudit.findUnique({ where: { supplierId: supplier.id } });
    if (!audit) {
      skipped.push(`${base}  — ${supplier.companyName} has no audit record yet`);
      continue;
    }

    const ext = path.extname(base).toLowerCase();
    const key = `audit-reports/${randomBytes(16).toString('hex')}${ext}`;
    plan.push({
      file: f,
      email,
      supplierId: supplier.id,
      company: supplier.companyName,
      key,
      url: `${env.R2_PUBLIC_URL_BASE!.replace(/\/$/, '')}/${key}`,
      name: downloadName(supplier.companyName, ext),
      type: MIME[ext] ?? 'application/octet-stream',
      size: fs.statSync(f).size,
    });
  }

  console.log(`files: ${files.length}   to upload: ${plan.length}   skipped: ${skipped.length}\n`);
  for (const p of plan) {
    console.log(`  ${path.basename(p.file).slice(0, 46).padEnd(48)} -> ${p.company.slice(0, 34).padEnd(36)} ${(p.size / 1024).toFixed(0)}KB`);
  }
  if (skipped.length) {
    console.log('\n--- skipped ---');
    for (const s of skipped) console.log(`  ${s}`);
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing uploaded. Add --commit.)');
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });

  let done = 0;
  for (const p of plan) {
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET!,
        Key: p.key,
        Body: fs.readFileSync(p.file),
        ContentType: p.type,
        // Ask the browser to save it under a readable name rather than the
        // random key, and keep it out of shared caches.
        ContentDisposition: `attachment; filename="${p.name}"`,
        CacheControl: 'private, max-age=3600',
      }),
    );
    await prisma.supplierAudit.update({
      where: { supplierId: p.supplierId },
      data: { reportFileUrl: p.url, reportFileName: p.name, reportFileType: p.type },
    });
    done++;
    console.log(`  ✓ ${p.company} — ${p.name}`);
  }

  console.log(`\n${done} report document(s) uploaded and linked.`);
  console.log('Suppliers still cannot see them until each audit is authorised.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
