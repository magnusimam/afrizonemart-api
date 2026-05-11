import type { BackgroundRemovalProvider, BackgroundRemovalResult } from './types';

/**
 * Pass-through provider. Returns the original buffer unchanged.
 *
 * Used when no AI provider is configured (no `REMOVE_BG_API_KEY`,
 * no CF Workers AI credentials). The "Share as image" feature still
 * works in this mode — the share card just shows the product image
 * with its original background visible. Useful as a launch-day
 * fallback so the feature can ship before any AI vendor is signed
 * up, and as the safety net if a real provider has an outage.
 */
export class NoopProvider implements BackgroundRemovalProvider {
  readonly name = 'noop';

  async remove(input: {
    buffer: Buffer;
    contentType: string;
  }): Promise<BackgroundRemovalResult> {
    return {
      buffer: input.buffer,
      contentType: input.contentType,
      isOriginal: true,
      provider: this.name,
    };
  }
}
