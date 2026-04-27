import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { renderEmail } from './render';
import { BlockTemplate, type Block, BLOCK_PALETTE } from './templates/render-blocks';
import { sendEmail } from './service';

const idParam = z.object({ id: z.string().min(1) });

const upsertSchema = z.object({
  type: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.array(z.record(z.string(), z.unknown())).default([]),
  preview: z.string().trim().max(200).nullish(),
  isActive: z.boolean().default(true),
  isSystem: z.boolean().default(false),
});

export function listBlockPaletteHandler(_req: Request, res: Response): void {
  res.json({ items: BLOCK_PALETTE });
}

export async function listTemplatesHandler(_req: Request, res: Response): Promise<void> {
  const items = await prisma.emailTemplate.findMany({
    orderBy: [{ isSystem: 'desc' }, { type: 'asc' }],
  });
  res.json({ items });
}

export async function getTemplateHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const item = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!item) throw HttpError.notFound('Template not found');
  res.json(item);
}

export async function upsertTemplateHandler(req: Request, res: Response): Promise<void> {
  const body = upsertSchema.parse(req.body);
  const existing = await prisma.emailTemplate.findUnique({ where: { type: body.type } });
  if (existing) {
    const item = await prisma.emailTemplate.update({
      where: { type: body.type },
      data: {
        name: body.name,
        subject: body.subject,
        body: body.body as object,
        preview: body.preview ?? null,
        isActive: body.isActive,
        // Don't let admin downgrade isSystem; keep whatever it was.
      },
    });
    res.json(item);
    return;
  }
  const item = await prisma.emailTemplate.create({
    data: {
      type: body.type,
      name: body.name,
      subject: body.subject,
      body: body.body as object,
      preview: body.preview ?? null,
      isActive: body.isActive,
      isSystem: body.isSystem,
    },
  });
  res.status(201).json(item);
}

export async function deleteTemplateHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) throw HttpError.notFound('Template not found');
  if (t.isSystem) {
    throw HttpError.badRequest(
      'Cannot delete a system template. Toggle isActive off to fall back to the hardcoded version.',
    );
  }
  await prisma.emailTemplate.delete({ where: { id } });
  res.status(204).end();
}

const previewBody = z.object({
  subject: z.string(),
  preview: z.string().nullish(),
  body: z.array(z.record(z.string(), z.unknown())),
  variables: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Renders a template tree to HTML without persisting or sending. Used
 * by the editor's live preview pane.
 */
export async function previewTemplateHandler(req: Request, res: Response): Promise<void> {
  const body = previewBody.parse(req.body);
  const html = await (
    await import('@react-email/render')
  ).render(
    BlockTemplate({
      preview: body.preview ?? body.subject,
      blocks: body.body as unknown as Block[],
      variables: body.variables,
    }),
    { pretty: false },
  );
  res.json({ html });
}

const sendTestBody = z.object({
  to: z.string().email(),
  subject: z.string(),
  preview: z.string().nullish(),
  body: z.array(z.record(z.string(), z.unknown())),
  variables: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Sends a real email to the admin's chosen address using the current
 * editor draft. Bypasses the DB lookup since the draft might not yet
 * be saved.
 */
export async function sendTestEmailHandler(req: Request, res: Response): Promise<void> {
  const body = sendTestBody.parse(req.body);
  await sendEmail({
    type: 'admin.preview',
    to: body.to,
    subject: body.subject,
    template: BlockTemplate({
      preview: body.preview ?? body.subject,
      blocks: body.body as unknown as Block[],
      variables: body.variables,
    }),
  });
  res.status(202).json({ ok: true });
}

// Used by the editor to pre-render the live preview.
void renderEmail;
