import { env } from '@/config/env';
import { prisma } from '@/infra/prisma';
import { escapeHtml } from '@/modules/notifications/telegram-provider';

/**
 * Interactive Telegram bot commands — the "check my store on demand"
 * half of the order bot (the other half is the outbound alert
 * dispatcher). Each builder returns a rendered HTML message + the
 * shared nav keyboard so every reply is also a launchpad to the
 * other views.
 *
 * All numbers are read straight from the order table — this is a
 * read-only ops surface, never mutates anything. Access is gated to
 * the admin chat ids by the controller before any of these run.
 */

export interface BotReply {
  text: string;
  replyMarkup: unknown;
}

/// Statuses where the customer's money has actually been received.
/// Revenue math sums only these; PENDING_PAYMENT / CANCELLED /
/// REFUNDED never count toward sales.
const REVENUE_STATUSES = [
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

const STATUS_EMOJI: Record<string, string> = {
  PENDING_PAYMENT: '⏳',
  PAID: '✅',
  FULFILLING: '🧾',
  SHIPPED: '📦',
  OUT_FOR_DELIVERY: '🚚',
  DELIVERED: '🎉',
  CANCELLED: '🚫',
  REFUNDED: '💸',
};

/// Inline keyboard attached to every reply so the bot is fully
/// tap-navigable — no need to remember slash commands.
const NAV_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '📊 Today', callback_data: 'cmd:today' },
      { text: '🕒 Recent', callback_data: 'cmd:recent' },
    ],
    [
      { text: '⏳ Pending', callback_data: 'cmd:pending' },
      { text: '📈 Stats', callback_data: 'cmd:stats' },
    ],
  ],
};

/// The set of callback_data payloads the buttons emit, mapped to the
/// command that answers them. Controller uses this to route taps.
export const CALLBACK_COMMANDS: Record<string, BotCommand> = {
  'cmd:today': 'today',
  'cmd:recent': 'recent',
  'cmd:pending': 'pending',
  'cmd:stats': 'stats',
};

export type BotCommand =
  | 'start'
  | 'help'
  | 'today'
  | 'recent'
  | 'pending'
  | 'stats';

/// Parse the leading "/command" out of a message, stripping any
/// "@botusername" suffix (Telegram appends it in group chats).
/// Returns null for non-command text.
export function parseCommand(text: string): BotCommand | null {
  const m = text.trim().match(/^\/([a-zA-Z_]+)/);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  if (
    cmd === 'start' ||
    cmd === 'help' ||
    cmd === 'today' ||
    cmd === 'recent' ||
    cmd === 'pending' ||
    cmd === 'stats'
  ) {
    return cmd;
  }
  return null;
}

/// Dispatch a command to its builder. `start`/`help` share one view.
export async function runCommand(cmd: BotCommand): Promise<BotReply> {
  switch (cmd) {
    case 'start':
    case 'help':
      return welcome();
    case 'today':
      return today();
    case 'recent':
      return recent();
    case 'pending':
      return pending();
    case 'stats':
      return stats();
  }
}

// --------------------------------------------------------------
// Builders
// --------------------------------------------------------------

function welcome(): BotReply {
  const text = [
    '👋 <b>Welcome to Afrizonemart Orders</b>',
    '',
    "I'm your store's order desk in Telegram. I alert you in real time whenever:",
    '🆕 a new order is placed',
    '✅ a payment succeeds',
    '❌ a payment fails',
    '📦 an order ships · 🎉 an order is delivered',
    '…and every other status change.',
    '',
    'You can also pull the numbers on demand — tap a button below or use the menu:',
    '📊 /today — today’s orders &amp; revenue',
    '🕒 /recent — your last 10 orders',
    '⏳ /pending — orders awaiting payment',
    '📈 /stats — sales at a glance',
  ].join('\n');
  return { text, replyMarkup: NAV_KEYBOARD };
}

async function today(): Promise<BotReply> {
  const start = startOfTodayLagos();
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start } },
    select: { status: true, total: true, currency: true },
  });

  const byStatus = new Map<string, number>();
  for (const o of orders) {
    byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  }
  const revenue = sumRevenueByCurrency(orders);

  const lines = [
    '📊 <b>Today</b> <i>(from midnight, Lagos)</i>',
    '',
    `Orders placed: <b>${orders.length}</b>`,
  ];
  if (orders.length > 0) {
    lines.push('');
    for (const status of ORDER_OF_STATUS) {
      const n = byStatus.get(status);
      if (n) lines.push(`${STATUS_EMOJI[status]} ${prettyStatus(status)}: <b>${n}</b>`);
    }
    lines.push('', `💰 Revenue received: <b>${formatRevenue(revenue)}</b>`);
  } else {
    lines.push('', '<i>No orders yet today.</i>');
  }
  return { text: lines.join('\n'), replyMarkup: NAV_KEYBOARD };
}

async function recent(): Promise<BotReply> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      currency: true,
      createdAt: true,
      shipFullName: true,
      user: { select: { name: true } },
    },
  });

  if (orders.length === 0) {
    return { text: '🕒 <b>Recent orders</b>\n\n<i>No orders yet.</i>', replyMarkup: NAV_KEYBOARD };
  }

  const lines = ['🕒 <b>Last 10 orders</b>', ''];
  for (const o of orders) {
    const who = escapeHtml(o.user.name?.trim() || o.shipFullName || 'a customer');
    lines.push(
      `${STATUS_EMOJI[o.status] ?? '•'} <a href="${env.WEB_URL}/admin/orders/${o.id}">${escapeHtml(o.orderNumber)}</a> — <b>${formatMoney(o.total, o.currency)}</b>`,
    );
    lines.push(`   ${who} · ${prettyStatus(o.status)} · ${timeAgo(o.createdAt)}`);
  }
  return { text: lines.join('\n'), replyMarkup: NAV_KEYBOARD };
}

async function pending(): Promise<BotReply> {
  const [count, orders] = await Promise.all([
    prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT' },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        orderNumber: true,
        total: true,
        currency: true,
        createdAt: true,
        shipFullName: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  if (count === 0) {
    return {
      text: '⏳ <b>Awaiting payment</b>\n\n✅ <i>Nothing pending — every order is settled.</i>',
      replyMarkup: NAV_KEYBOARD,
    };
  }

  const lines = [`⏳ <b>Awaiting payment — ${count}</b>`, ''];
  for (const o of orders) {
    const who = escapeHtml(o.user.name?.trim() || o.shipFullName || 'a customer');
    lines.push(
      `• <a href="${env.WEB_URL}/admin/orders/${o.id}">${escapeHtml(o.orderNumber)}</a> — <b>${formatMoney(o.total, o.currency)}</b> · ${who} · ${timeAgo(o.createdAt)}`,
    );
  }
  if (count > orders.length) {
    lines.push('', `<i>…and ${count - orders.length} more.</i>`);
  }
  return { text: lines.join('\n'), replyMarkup: NAV_KEYBOARD };
}

async function stats(): Promise<BotReply> {
  const now = Date.now();
  const since30 = new Date(now - 30 * 86_400_000);
  const start7 = new Date(now - 7 * 86_400_000);
  const startToday = startOfTodayLagos();

  /// One 30-day pull, then slice in memory for the shorter windows.
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since30 } },
    select: { status: true, total: true, currency: true, createdAt: true },
  });

  const windowLine = (label: string, from: Date): string => {
    const slice = orders.filter((o) => o.createdAt >= from);
    const paid = slice.filter((o) =>
      (REVENUE_STATUSES as readonly string[]).includes(o.status),
    );
    const rev = sumRevenueByCurrency(slice);
    return `${label}: <b>${slice.length}</b> orders · ${paid.length} paid · 💰 ${formatRevenue(rev)}`;
  };

  const text = [
    '📈 <b>Sales at a glance</b>',
    '',
    windowLine('Today', startToday),
    windowLine('Last 7 days', start7),
    windowLine('Last 30 days', since30),
    '',
    '<i>Revenue counts money actually received (paid → delivered).</i>',
  ].join('\n');
  return { text, replyMarkup: NAV_KEYBOARD };
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

/// Display order for the today breakdown.
const ORDER_OF_STATUS = [
  'PENDING_PAYMENT',
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

function prettyStatus(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/// Sum received revenue, keyed by currency (orders can be NGN / USD /
/// GBP and must not be added together).
function sumRevenueByCurrency(
  orders: Array<{ status: string; total: number; currency: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    if (!(REVENUE_STATUSES as readonly string[]).includes(o.status)) continue;
    out.set(o.currency, (out.get(o.currency) ?? 0) + o.total);
  }
  return out;
}

function formatRevenue(byCurrency: Map<string, number>): string {
  if (byCurrency.size === 0) return formatMoney(0, 'NGN');
  return [...byCurrency.entries()]
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' + ');
}

/// Currency formatting — mirrors the alert dispatcher so the whole
/// bot reads consistently. `total` is stored in whole currency units.
function formatMoney(amount: number, currency: string): string {
  if (currency === 'NGN') return `₦${amount.toLocaleString('en-NG')}`;
  return `${currency} ${amount.toLocaleString('en-NG')}`;
}

/// UTC instant of the most recent midnight in Lagos (UTC+1, no DST).
/// Magnus reads "today" as a Lagos day, not a UTC day.
function startOfTodayLagos(): Date {
  const LAGOS_OFFSET_MIN = 60;
  const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MIN * 60_000);
  const midnightLagosAsUtc = Date.UTC(
    lagosNow.getUTCFullYear(),
    lagosNow.getUTCMonth(),
    lagosNow.getUTCDate(),
  );
  return new Date(midnightLagosAsUtc - LAGOS_OFFSET_MIN * 60_000);
}

/// Compact "3m ago" / "2h ago" / "4d ago" relative time.
function timeAgo(date: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
