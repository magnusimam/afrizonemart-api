/**
 * Capability-based permission model.
 *
 * Capabilities are atomic permissions ("orders.refund", "products.write",
 * etc.). The effective permission set for any user is computed as:
 *
 *   - role=ADMIN     → every capability (firehose; bypasses checks)
 *   - role=STAFF     → User.permissions[]  (per-user grants set by admin)
 *   - role=SELLER    → SELLER role-default capabilities
 *   - role=CUSTOMER  → none
 *
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  SHIPPING A NEW ADMIN SECTION? READ THIS FIRST.                    ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║  Adding a new admin page or feature WITHOUT a capability entry     ║
 * ║  means it's either:                                                ║
 * ║   (a) open to anyone with STAFF role (no gate), or                 ║
 * ║   (b) ADMIN-only and never tickable for individual staff.          ║
 * ║                                                                    ║
 * ║  THE 3-STEP CHECKLIST for every new admin section:                 ║
 * ║                                                                    ║
 * ║  1. Add the capability to the `Capability` union below.            ║
 * ║  2. Add a `CAPABILITY_LABELS` entry (domain + human label).        ║
 * ║  3. Wrap the route with `requireCapability('your.cap')` in the     ║
 * ║     module's routes.ts — this is the actual server-side gate.      ║
 * ║                                                                    ║
 * ║  That's it. The storefront's "Add staff" dialog and "Edit          ║
 * ║  existing staff" matrix both fetch this list dynamically via       ║
 * ║  `GET /api/admin/staff/permissions`. As soon as step 1+2 ships     ║
 * ║  to prod, the new permission is **immediately tickable in both    ║
 * ║  UIs** — no storefront redeploy needed for the checkbox to         ║
 * ║  appear.                                                           ║
 * ║                                                                    ║
 * ║  Sidebar visibility is a separate concern: add a NAV entry in      ║
 * ║  afrizonemart-v2/src/components/admin/AdminSidebar.tsx with the    ║
 * ║  matching `cap:` key so the new section appears in the menu for    ║
 * ║  users who have it ticked.                                         ║
 * ║                                                                    ║
 * ║  The storefront's `lib/permissions.ts` no longer mirrors this      ║
 * ║  list — `Capability` is a loose `string` there. You don't need     ║
 * ║  to touch it.                                                      ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

export type Capability =
  // Catalog
  | 'products.read'
  | 'products.write'
  /// Narrowly-scoped capability for the intern image-update workflow.
  /// Grants access only to the intern queue UI + image upload + submit.
  /// Does NOT grant edit access to product data.
  | 'products.image-only'
  | 'categories.write'
  | 'reviews.moderate'
  | 'custom-fields.write'
  // Commerce
  | 'orders.read'
  | 'orders.write'
  | 'orders.refund'
  | 'coupons.write'
  | 'shipping.write'
  | 'payment-gateways.write'
  /// Intern image-work payouts — list, preview, draft, finalize,
  /// cancel. Granted to finance/payroll staff who shouldn't need the
  /// rest of the admin surface to settle contractor pay.
  | 'payouts.write'
  // People
  | 'customers.read'
  | 'customers.write'
  | 'staff.manage'
  // Marketing / CMS
  | 'cms-pages.write'
  | 'content.write'
  | 'blog.write'
  | 'placements.write'
  | 'feature-flags.write'
  | 'business-rules.write'
  // Notifications & integrations
  | 'notifications.write'
  | 'email-templates.write'
  | 'webhooks.write'
  // Operations
  | 'reports.read'
  | 'audit.read'
  | 'uploads.write'
  | 'settings.write'
  // Loyalty (Continental Rewards)
  | 'loyalty.read'
  | 'loyalty.write';

export type StaffRole = 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'STAFF';

export const CAPABILITY_LABELS: Record<Capability, { domain: string; label: string }> = {
  // Catalog
  'products.read': { domain: 'Catalog', label: 'View products' },
  'products.write': { domain: 'Catalog', label: 'Create / edit / delete products' },
  'products.image-only': { domain: 'Catalog', label: 'Upload product images (intern queue only)' },
  'categories.write': { domain: 'Catalog', label: 'Manage categories' },
  'reviews.moderate': { domain: 'Catalog', label: 'Moderate reviews' },
  'custom-fields.write': { domain: 'Catalog', label: 'Manage product custom fields' },
  // Commerce
  'orders.read': { domain: 'Commerce', label: 'View orders' },
  'orders.write': { domain: 'Commerce', label: 'Update orders & status' },
  'orders.refund': { domain: 'Commerce', label: 'Issue refunds' },
  'coupons.write': { domain: 'Commerce', label: 'Manage coupons & discounts' },
  'shipping.write': { domain: 'Commerce', label: 'Configure shipping zones & rates' },
  'payment-gateways.write': { domain: 'Commerce', label: 'Configure payment gateways' },
  'payouts.write': { domain: 'Commerce', label: 'Manage intern payouts (settle contractor pay)' },
  // People
  'customers.read': { domain: 'People', label: 'View customers' },
  'customers.write': { domain: 'People', label: 'Edit customer profiles' },
  'staff.manage': { domain: 'People', label: 'Add / remove staff & change permissions' },
  // Marketing / CMS
  'cms-pages.write': { domain: 'Content', label: 'Edit legacy long-form CMS pages' },
  'content.write': { domain: 'Content', label: 'Edit site text + images (homepage / landing pages)' },
  'blog.write': { domain: 'Content', label: 'Write & publish blog posts' },
  'placements.write': { domain: 'Content', label: 'Manage product placements' },
  'feature-flags.write': { domain: 'Content', label: 'Toggle feature flags' },
  'business-rules.write': { domain: 'Content', label: 'Edit business rules' },
  // Integrations
  'notifications.write': { domain: 'Integrations', label: 'Send & manage notifications' },
  'email-templates.write': { domain: 'Integrations', label: 'Edit email templates' },
  'webhooks.write': { domain: 'Integrations', label: 'Configure webhooks' },
  // Operations
  'reports.read': { domain: 'Operations', label: 'View sales & inventory reports' },
  'audit.read': { domain: 'Operations', label: 'View admin audit log' },
  'uploads.write': { domain: 'Operations', label: 'Upload images & assets' },
  'settings.write': { domain: 'Operations', label: 'Edit store settings' },
  // Loyalty (Continental Rewards)
  'loyalty.read': { domain: 'Loyalty', label: 'View Continental Rewards accounts & transactions' },
  'loyalty.write': { domain: 'Loyalty', label: 'Edit Continental Rewards config + manual coin adjustments' },
};

export const ALL_CAPABILITIES: Capability[] = Object.keys(CAPABILITY_LABELS) as Capability[];

export const ROLE_CAPABILITIES: Record<StaffRole, Capability[]> = {
  CUSTOMER: [],
  SELLER: ['orders.read', 'products.read', 'products.write', 'uploads.write'],
  // ADMIN's effective set is computed as ALL_CAPABILITIES at check time —
  // this constant is just for the matrix-display roles legend.
  ADMIN: ALL_CAPABILITIES,
  // STAFF resolves to User.permissions[] at runtime; default empty.
  STAFF: [],
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  CUSTOMER: 'Standard buyer. Can browse, place orders, leave reviews.',
  SELLER:
    'Vendor on the marketplace. Can manage their own products and view their own orders. Cannot touch other sellers or platform settings.',
  ADMIN:
    'Full platform access. Can manage everything — products, orders, customers, refunds, other staff. Use sparingly.',
  STAFF:
    'Per-user-permissions account. Each staff member only sees the admin sections you grant them. Used for interns, contractors, and scoped employees.',
};

/**
 * Resolve a user's effective capability set. This is the single source
 * of truth for "can this user do X?" — admin endpoints, sidebar filter,
 * and any other gate should compare against this.
 */
export function effectiveCapabilities(
  role: StaffRole,
  userPermissions: string[] | null | undefined,
): Set<Capability> {
  if (role === 'ADMIN') return new Set(ALL_CAPABILITIES);
  if (role === 'STAFF') {
    const grants = (userPermissions ?? []).filter((p): p is Capability =>
      Object.prototype.hasOwnProperty.call(CAPABILITY_LABELS, p),
    );
    const set = new Set<Capability>(grants);
    // Implicit grant: anyone with products.image-only needs to upload
    // files to fulfill that role. Saving the admin from having to tick
    // both boxes — without it, the intern queue is dead-on-arrival.
    if (set.has('products.image-only')) set.add('uploads.write');
    return set;
  }
  return new Set(ROLE_CAPABILITIES[role]);
}

export function hasCapability(
  role: StaffRole,
  userPermissions: string[] | null | undefined,
  capability: Capability,
): boolean {
  return effectiveCapabilities(role, userPermissions).has(capability);
}
