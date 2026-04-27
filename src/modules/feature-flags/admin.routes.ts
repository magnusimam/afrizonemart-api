import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { invalidateFlag } from './service';

export const adminFeatureFlagRoutes = Router();

const idParam = z.object({ id: z.string().min(1) });

const ruleSchema = z.object({
  match: z.record(z.string(), z.unknown()).default({}),
  value: z.boolean(),
});

const upsertSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers, underscores'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  defaultValue: z.boolean().default(false),
  targetingRules: z.array(ruleSchema).default([]),
  isActive: z.boolean().default(true),
});

const updateSchema = upsertSchema.partial().omit({ key: true });

adminFeatureFlagRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    res.json({ items });
  }),
);

adminFeatureFlagRoutes.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = upsertSchema.parse(req.body);
    const existing = await prisma.featureFlag.findUnique({ where: { key: body.key } });
    if (existing) throw HttpError.conflict(`Flag "${body.key}" already exists.`);
    const row = await prisma.featureFlag.create({
      data: {
        ...body,
        description: body.description ?? null,
        targetingRules: body.targetingRules as object,
      },
    });
    invalidateFlag(body.key);
    res.status(201).json(row);
  }),
);

adminFeatureFlagRoutes.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const body = updateSchema.parse(req.body);
    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('Flag not found');
    const row = await prisma.featureFlag.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description ?? null }),
        ...(body.defaultValue !== undefined && { defaultValue: body.defaultValue }),
        ...(body.targetingRules !== undefined && {
          targetingRules: body.targetingRules as object,
        }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    invalidateFlag(existing.key);
    res.json(row);
  }),
);

adminFeatureFlagRoutes.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('Flag not found');
    await prisma.featureFlag.delete({ where: { id } });
    invalidateFlag(existing.key);
    res.status(204).end();
  }),
);
