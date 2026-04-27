import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { evaluate, invalidateScope } from './service';

export const adminBusinessRuleRoutes = Router();

const idParam = z.object({ id: z.string().min(1) });

const upsertSchema = z.object({
  scope: z.string().trim().min(1).max(60),
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers, underscores'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(100),
  conditions: z.record(z.string(), z.unknown()).default({}),
  actions: z.record(z.string(), z.unknown()).default({}),
});

const updateSchema = upsertSchema.partial().omit({ scope: true, key: true });

const listQuery = z.object({ scope: z.string().optional() });

adminBusinessRuleRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = listQuery.parse(req.query);
    const items = await prisma.businessRule.findMany({
      where: q.scope ? { scope: q.scope } : undefined,
      orderBy: [{ scope: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ items });
  }),
);

adminBusinessRuleRoutes.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = upsertSchema.parse(req.body);
    const existing = await prisma.businessRule.findUnique({
      where: { scope_key: { scope: body.scope, key: body.key } },
    });
    if (existing)
      throw HttpError.conflict(`Rule ${body.scope}/${body.key} already exists.`);
    const row = await prisma.businessRule.create({
      data: {
        scope: body.scope,
        key: body.key,
        name: body.name,
        description: body.description ?? null,
        isActive: body.isActive,
        priority: body.priority,
        conditions: body.conditions as object,
        actions: body.actions as object,
      },
    });
    invalidateScope(body.scope);
    res.status(201).json(row);
  }),
);

adminBusinessRuleRoutes.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const body = updateSchema.parse(req.body);
    const existing = await prisma.businessRule.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('Rule not found');
    const row = await prisma.businessRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description ?? null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.conditions !== undefined && { conditions: body.conditions as object }),
        ...(body.actions !== undefined && { actions: body.actions as object }),
      },
    });
    invalidateScope(existing.scope);
    res.json(row);
  }),
);

adminBusinessRuleRoutes.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const existing = await prisma.businessRule.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('Rule not found');
    await prisma.businessRule.delete({ where: { id } });
    invalidateScope(existing.scope);
    res.status(204).end();
  }),
);

const evalBody = z.object({
  scope: z.string(),
  context: z.record(z.string(), z.unknown()),
});

/**
 * Test endpoint — admin pastes a sample context and sees which rules
 * match and what their merged actions are. Helps debug conditions.
 */
adminBusinessRuleRoutes.post(
  '/evaluate',
  asyncHandler(async (req: Request, res: Response) => {
    const body = evalBody.parse(req.body);
    const hits = await evaluate(body.scope, body.context);
    res.json({ hits });
  }),
);
