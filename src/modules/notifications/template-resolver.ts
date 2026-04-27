import * as React from 'react';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { BlockTemplate, type Block, interpolate } from './templates/render-blocks';

/**
 * Phase 10.3 — Template lookup that prefers admin-edited DB templates
 * over the hardcoded TSX fallback.
 *
 * Each event type has both:
 *  - a hardcoded React Email file in `templates/<Name>.tsx` (the canon
 *    pre-launch templates)
 *  - optionally an `EmailTemplate` row in the DB authored from
 *    /admin/email-templates
 *
 * If a DB template exists and isActive, this returns it (with the
 * subject substituted). Otherwise the dispatcher renders the hardcoded
 * TSX with its own copy.
 */
export interface ResolvedTemplate {
  subject: string;
  element: React.ReactElement;
}

export async function resolveDbTemplate(
  type: string,
  variables: Record<string, unknown>,
): Promise<ResolvedTemplate | null> {
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { type } });
    if (!row || !row.isActive) return null;

    const blocks = (row.body as unknown as Block[]) ?? [];
    if (blocks.length === 0) return null;

    return {
      subject: interpolate(row.subject, variables),
      element: BlockTemplate({
        preview: row.preview ?? row.subject,
        blocks,
        variables,
      }),
    };
  } catch (err) {
    logger.warn('email.template.db_lookup_failed', {
      type,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
