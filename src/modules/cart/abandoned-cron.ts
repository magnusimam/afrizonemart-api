import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';

/**
 * Phase Audit.9 — abandoned-cart sweeper.
 *
 * Looks for carts where:
 *  - the user has at least 1 item
 *  - the cart hasn't been touched in 24h
 *  - we haven't already sent a recovery email
 *
 * Emits `cart.abandoned`; the notifications dispatcher sends the
 * recovery email; we stamp `abandonedNotifiedAt` so we never double-send.
 *
 * Runs in-process every 15 minutes — fine at our scale. Move to a real
 * BullMQ + Redis job queue when the cart count crosses ~10k.
 */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);

    const candidates = await prisma.cart.findMany({
      where: {
        abandonedNotifiedAt: null,
        updatedAt: { lt: cutoff },
        items: { some: {} },
      },
      include: {
        items: {
          select: {
            quantity: true,
            product: { select: { price: true } },
          },
        },
      },
      take: 50, // safety cap per sweep
    });

    if (candidates.length === 0) {
      logger.debug('cart.abandoned.sweep.empty');
      return;
    }

    for (const cart of candidates) {
      const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
      const total = cart.items.reduce(
        (s, i) => s + i.product.price * i.quantity,
        0,
      );
      if (itemCount === 0) continue;

      await eventBus.emit('cart.abandoned', {
        userId: cart.userId,
        cartId: cart.id,
        itemCount,
        total,
      });

      await prisma.cart.update({
        where: { id: cart.id },
        data: { abandonedNotifiedAt: new Date() },
      });
    }

    logger.info('cart.abandoned.sweep.done', { notified: candidates.length });
  } catch (err) {
    logger.error('cart.abandoned.sweep.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startAbandonedCartCron(): void {
  // Sweep on startup (after a small delay so the DB pool is warm) +
  // every SWEEP_INTERVAL_MS thereafter.
  setTimeout(() => void sweep(), 60_000);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('cart.abandoned.cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    abandonedAfterMs: ABANDONED_AFTER_MS,
  });
}
