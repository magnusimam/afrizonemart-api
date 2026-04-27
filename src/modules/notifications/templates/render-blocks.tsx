import * as React from 'react';
import { brand, formatNGN } from './_brand';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
  SubHeading,
} from './_layout';

/**
 * Phase 10.3 — Block-tree → React Email renderer.
 *
 * Templates authored in /admin/email-templates are stored as a flat JSON
 * array of blocks. At send time we walk the tree, substitute
 * `{variables}` from the event payload, and render each block to one
 * of the existing layout primitives.
 *
 * Adding a new block type is two steps: append to `Block` union below
 * and add a case in the switch in `renderBlock`. The admin block palette
 * is auto-built from `BLOCK_PALETTE` so it shows up automatically.
 */

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'spacer'; size?: number }
  | { type: 'divider' }
  | { type: 'image'; src: string; alt?: string; width?: number }
  | { type: 'info-card'; rows: Array<{ label: string; value: string }> }
  | { type: 'item-list'; items: Array<{ name: string; qty: number; price: number }>; total?: number };

export interface BlockPaletteEntry {
  type: Block['type'];
  label: string;
  description: string;
  factory: () => Block;
}

export const BLOCK_PALETTE: BlockPaletteEntry[] = [
  {
    type: 'heading',
    label: 'Heading',
    description: 'Big navy headline',
    factory: () => ({ type: 'heading', text: 'Welcome!' }),
  },
  {
    type: 'subheading',
    label: 'Sub-heading',
    description: 'Section divider in caps',
    factory: () => ({ type: 'subheading', text: 'Section title' }),
  },
  {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Body text — supports {variables}',
    factory: () => ({ type: 'paragraph', text: 'Body text goes here.' }),
  },
  {
    type: 'button',
    label: 'Call-to-action button',
    description: 'Navy button with amber-on-hover',
    factory: () => ({ type: 'button', label: 'Click me', href: '{trackUrl}' }),
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Inline image — public URL',
    factory: () => ({ type: 'image', src: 'https://images.afrizonemart.com/...', alt: '' }),
  },
  {
    type: 'info-card',
    label: 'Info card',
    description: 'Two-column label/value table inside a panel',
    factory: () => ({
      type: 'info-card',
      rows: [
        { label: 'Order #', value: '{orderNumber}' },
        { label: 'Total', value: '{total}' },
      ],
    }),
  },
  {
    type: 'item-list',
    label: 'Order items',
    description: 'Render the order line items + total',
    factory: () => ({ type: 'item-list', items: [] }),
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Thin horizontal line',
    factory: () => ({ type: 'divider' }),
  },
  {
    type: 'spacer',
    label: 'Spacer',
    description: 'Vertical breathing room',
    factory: () => ({ type: 'spacer', size: 16 }),
  },
];

// ---------- variable substitution ----------

/**
 * Replaces every `{key}` in `s` with the matching value from `vars`.
 * Missing keys are left as-is so the editor can preview templates with
 * placeholders intact.
 */
export function interpolate(
  s: string,
  vars: Record<string, unknown>,
): string {
  return s.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, key) => {
    const v = lookup(vars, String(key));
    if (v === undefined || v === null) return `{${key}}`;
    return String(v);
  });
}

function lookup(vars: Record<string, unknown>, dotted: string): unknown {
  if (dotted in vars) return vars[dotted];
  const parts = dotted.split('.');
  let v: unknown = vars;
  for (const p of parts) {
    if (v && typeof v === 'object' && p in (v as Record<string, unknown>)) {
      v = (v as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return v;
}

// ---------- block renderer ----------

function renderBlock(block: Block, vars: Record<string, unknown>, key: number): React.ReactNode {
  switch (block.type) {
    case 'heading':
      return <Heading key={key}>{interpolate(block.text, vars)}</Heading>;
    case 'subheading':
      return <SubHeading key={key}>{interpolate(block.text, vars)}</SubHeading>;
    case 'paragraph':
      return <Paragraph key={key}>{interpolate(block.text, vars)}</Paragraph>;
    case 'button':
      return (
        <Button key={key} href={interpolate(block.href, vars)}>
          {interpolate(block.label, vars)}
        </Button>
      );
    case 'spacer':
      return <div key={key} style={{ height: `${block.size ?? 16}px` }} />;
    case 'divider':
      return (
        <hr
          key={key}
          style={{
            border: 0,
            borderTop: `1px solid ${brand.border}`,
            margin: '16px 0',
          }}
        />
      );
    case 'image':
      return (
        <img
          key={key}
          src={interpolate(block.src, vars)}
          alt={block.alt ?? ''}
          width={block.width ?? 520}
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            margin: '12px auto',
          }}
        />
      );
    case 'info-card':
      return (
        <InfoCard key={key}>
          {block.rows.map((r, i) => (
            <Row
              key={i}
              label={interpolate(r.label, vars)}
              value={interpolate(r.value, vars)}
            />
          ))}
        </InfoCard>
      );
    case 'item-list': {
      // Pull line items from the variables when not provided inline.
      const items =
        block.items.length > 0
          ? block.items
          : ((vars.items as Array<{ name: string; qty: number; price: number }>) ?? []);
      const total =
        block.total ?? (typeof vars.total === 'number' ? (vars.total as number) : null);
      return (
        <table
          key={key}
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          width="100%"
          style={{ borderCollapse: 'collapse', margin: '8px 0 16px 0' }}
        >
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td
                  style={{
                    borderBottom: `1px solid ${brand.border}`,
                    color: brand.charcoal,
                    fontSize: '14px',
                    padding: '10px 0',
                  }}
                >
                  {it.name} <span style={{ color: brand.muted }}>× {it.qty}</span>
                </td>
                <td
                  style={{
                    borderBottom: `1px solid ${brand.border}`,
                    color: brand.navy,
                    fontSize: '14px',
                    fontWeight: 700,
                    padding: '10px 0',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatNGN(it.price * it.qty)}
                </td>
              </tr>
            ))}
            {total !== null && (
              <tr>
                <td
                  style={{
                    color: brand.navy,
                    fontSize: '15px',
                    fontWeight: 700,
                    padding: '12px 0',
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    color: brand.amber,
                    fontSize: '18px',
                    fontWeight: 700,
                    padding: '12px 0',
                    textAlign: 'right',
                  }}
                >
                  {formatNGN(total)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      );
    }
  }
}

export interface RenderTemplateProps {
  preview: string;
  blocks: Block[];
  variables: Record<string, unknown>;
}

export function BlockTemplate({ preview, blocks, variables }: RenderTemplateProps) {
  return (
    <EmailLayout preview={interpolate(preview, variables)}>
      {blocks.map((block, i) => renderBlock(block, variables, i))}
    </EmailLayout>
  );
}
