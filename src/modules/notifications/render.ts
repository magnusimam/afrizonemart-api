import * as React from 'react';
import { render } from '@react-email/render';

/**
 * Thin wrapper around `@react-email/render` so the dispatcher and tests
 * never need to import React-Email directly. Returns both HTML (for the
 * provider) and a plaintext fallback (some clients prefer it; spam
 * filters score it kinder).
 */
export async function renderEmail(
  element: React.ReactElement,
): Promise<{ html: string; text: string }> {
  const html = await render(element, { pretty: false });
  const text = await render(element, { plainText: true });
  return { html, text };
}
