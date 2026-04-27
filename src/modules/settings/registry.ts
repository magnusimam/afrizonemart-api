/**
 * Single source of truth for all admin-editable settings.
 *
 * Adding a new setting: append to SETTINGS_REGISTRY here. The admin
 * UI auto-renders the right input control based on `type`, and the
 * service validates that PUT bodies only touch keys we know about.
 */
export type SettingType = 'string' | 'number' | 'boolean' | 'email' | 'longtext';

export type SettingGroup =
  | 'general'
  | 'inventory'
  | 'shipping'
  | 'orders'
  | 'notifications'
  | 'advanced';

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  group: SettingGroup;
  type: SettingType;
  /** Default returned when no row exists yet. */
  defaultValue: string | number | boolean;
}

export const SETTINGS_REGISTRY: SettingDef[] = [
  // General
  { key: 'store.name', label: 'Store name', group: 'general', type: 'string', defaultValue: 'Afrizonemart' },
  { key: 'store.tagline', label: 'Tagline', group: 'general', type: 'string', defaultValue: 'Made in Africa, delivered worldwide' },
  { key: 'store.contact_email', label: 'Contact email', group: 'general', type: 'email', defaultValue: 'hello@afrizonemart.com', description: 'Where customer enquiries get sent.' },
  { key: 'store.address', label: 'Store address', group: 'general', type: 'longtext', defaultValue: '12 Awolowo Road, Ikoyi, Lagos, Nigeria' },
  { key: 'store.default_currency', label: 'Default currency', group: 'general', type: 'string', defaultValue: 'NGN', description: 'ISO-4217 code (NGN, USD, GBP, …).' },

  // Inventory
  { key: 'inventory.low_stock_threshold', label: 'Low-stock threshold', group: 'inventory', type: 'number', defaultValue: 5, description: 'Show low-stock alerts on products at or below this count.' },
  { key: 'inventory.hide_out_of_stock', label: 'Hide out-of-stock products', group: 'inventory', type: 'boolean', defaultValue: false, description: 'When on, OOS products disappear from public listings entirely.' },

  // Shipping
  { key: 'shipping.free_above_threshold', label: 'Default free-shipping threshold (NGN)', group: 'shipping', type: 'number', defaultValue: 10000, description: 'Used by zones/rates that don\'t set their own threshold.' },

  // Orders
  { key: 'orders.number_prefix', label: 'Order number prefix', group: 'orders', type: 'string', defaultValue: 'AZM' },
  { key: 'orders.cancel_after_minutes', label: 'Auto-cancel unpaid orders after (minutes)', group: 'orders', type: 'number', defaultValue: 60, description: '0 disables the auto-cancel job.' },

  // Notifications (transactional email — Phase 8)
  { key: 'notifications.from_name', label: 'From name', group: 'notifications', type: 'string', defaultValue: 'Afrizonemart', description: 'The "from" display name used on every transactional email.' },
  { key: 'notifications.from_email', label: 'From email', group: 'notifications', type: 'email', defaultValue: 'no-reply@afrizonemart.com', description: 'The "from" address used on every transactional email. Must be verified with your email provider.' },
  { key: 'notifications.reply_to', label: 'Reply-to email', group: 'notifications', type: 'email', defaultValue: 'support@afrizonemart.com', description: 'When customers reply to a transactional email, replies land here.' },
  { key: 'notifications.send_welcome', label: 'Send welcome email on signup', group: 'notifications', type: 'boolean', defaultValue: true },

  // Advanced
  { key: 'advanced.maintenance_mode', label: 'Maintenance mode', group: 'advanced', type: 'boolean', defaultValue: false, description: 'When on, the storefront returns a "we\'ll be right back" page.' },
];

export const REGISTRY_BY_KEY: Record<string, SettingDef> = Object.fromEntries(
  SETTINGS_REGISTRY.map((s) => [s.key, s]),
);

export function isKnownKey(key: string): boolean {
  return key in REGISTRY_BY_KEY;
}
