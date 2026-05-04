import { logger } from '@/infra/logger';
import { publishScheduledPosts } from './service';

/// Run once a minute. Cheap query (indexed on status + publishedAt) so
/// the constant tick is fine even at scale.
const TICK_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduledBlogCron(): void {
  if (timer) return;
  const tick = async () => {
    try {
      const promoted = await publishScheduledPosts();
      if (promoted > 0) {
        logger.info('blog.scheduled.published', { count: promoted });
      }
    } catch (err) {
      logger.error('blog.scheduled.failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  timer = setInterval(tick, TICK_MS);
  // Fire once on boot so a missed-while-restarting tick doesn't delay
  // a scheduled post by up to a minute.
  void tick();
}
