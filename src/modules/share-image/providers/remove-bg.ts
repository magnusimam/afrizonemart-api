import type { BackgroundRemovalProvider, BackgroundRemovalResult } from './types';

/**
 * remove.bg API client.
 *
 * Quality-leader for product cutouts (handles hair / fur / glass /
 * shadows that the open-source models stumble on). Charges ~$0.20 per
 * call on the pay-as-you-go tier, dropping to ~$0.10/img at scale.
 * Free tier is 1/day so this is effectively a paid integration.
 *
 * We send the original image as binary (`multipart/form-data`,
 * field `image_file`) and request `image/png` so the response is a
 * transparent PNG we can drop straight onto a branded backdrop.
 *
 * Failure mode is intentional: when remove.bg rejects (bad image,
 * quota exhausted, network blip), we throw and let the caller fall
 * back to the noop provider. The user still gets a share image —
 * just without the floating-product look.
 */
export class RemoveBgProvider implements BackgroundRemovalProvider {
  readonly name = 'remove.bg';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async remove(input: {
    buffer: Buffer;
    contentType: string;
  }): Promise<BackgroundRemovalResult> {
    const form = new FormData();
    form.append(
      'image_file',
      new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
      'product',
    );
    form.append('size', 'auto');
    form.append('format', 'png');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `remove.bg responded ${res.status}: ${detail.slice(0, 200)}`,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: 'image/png',
      isOriginal: false,
      provider: this.name,
    };
  }
}
