import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { isStaticKey, isCmsKey, REGISTRY_BY_KEY } from './registry';

/**
 * Phase 10.7 — Placement service.
 *
 * One row per (product, placement-key). Replaces a product's placement
 * set on save (set-based update — admin sees current rows, edits the
 * full list, we diff and apply).
 */

export interface PlacementInput {
  placement: string;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  countries?: string[];
}

export async function setProductPlacements(
  productId: string,
  inputs: PlacementInput[],
): Promise<void> {
  // Validate keys against the static registry + active CMS slugs.
  const cmsSlugs = new Set(
    (
      await prisma.cmsPage.findMany({
        where: { isPublished: true },
        select: { slug: true },
      })
    ).map((p) => p.slug),
  );

  const seen = new Set<string>();
  for (const i of inputs) {
    if (seen.has(i.placement)) {
      throw HttpError.badRequest(
        `Duplicate placement "${i.placement}" — each placement can only appear once per product.`,
      );
    }
    seen.add(i.placement);
    if (
      !isStaticKey(i.placement) &&
      !(isCmsKey(i.placement) && cmsSlugs.has(i.placement.slice(4)))
    ) {
      throw HttpError.badRequest(`Unknown placement key: "${i.placement}"`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productPlacement.deleteMany({ where: { productId } });
    if (inputs.length > 0) {
      await tx.productPlacement.createMany({
        data: inputs.map((i) => ({
          productId,
          placement: i.placement,
          sortOrder: i.sortOrder ?? 100,
          startsAt: i.startsAt ? new Date(i.startsAt) : null,
          endsAt: i.endsAt ? new Date(i.endsAt) : null,
          countries: i.countries ?? [],
        })),
      });
    }
  });
}

export async function getProductPlacements(productId: string) {
  return prisma.productPlacement.findMany({
    where: { productId },
    orderBy: [{ sortOrder: 'asc' }],
  });
}

/**
 * Returns the WHERE clause used by the products list to filter by
 * placement (with optional country + current-time scoping).
 */
export function placementFilter(
  placement: string,
  country?: string,
): Prisma.ProductWhereInput {
  const now = new Date();
  return {
    placements: {
      some: {
        placement,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ...(country
            ? [{ OR: [{ countries: { isEmpty: true } }, { countries: { has: country } }] }]
            : []),
        ],
      },
    },
  };
}

export function placementOrderBy(placement: string): Prisma.ProductOrderByWithRelationInput[] {
  // We can't easily order by the join row's sortOrder via Prisma's
  // declarative API, so we return the standard order; pages that care
  // about sortOrder fetch placements separately and re-order.
  void placement;
  return [{ createdAt: 'desc' }];
}

export const PLACEMENT_GROUPS = REGISTRY_BY_KEY;
