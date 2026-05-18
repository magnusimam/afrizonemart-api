import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { requireRole } from '@/middleware/require-role';
import { requireCapability } from '@/middleware/require-capability';
import { adminBrandRoutes, adminProductRoutes } from '@/modules/products/admin.routes';
import { adminCategoryRoutes } from '@/modules/categories/admin.routes';
import { adminReviewRoutes } from '@/modules/reviews/admin.routes';
import { adminOrderRoutes } from '@/modules/orders/admin.routes';
import { adminCustomerRoutes, adminStaffRoutes } from '@/modules/customers/admin.routes';
import { adminCouponRoutes } from '@/modules/coupons/admin.routes';
import { adminShippingRoutes } from '@/modules/shipping/admin.routes';
import { adminSettingsRoutes } from '@/modules/settings/admin.routes';
import { adminAuditRoutes } from '@/modules/audit/admin.routes';
import { adminWebhookRoutes } from '@/modules/webhooks/admin.routes';
import { adminReportRoutes } from '@/modules/reports/admin.routes';
import {
  adminEmailTemplateRoutes,
  adminNotificationRoutes,
} from '@/modules/notifications/admin.routes';
import { adminCustomFieldRoutes } from '@/modules/custom-fields/admin.routes';
import { adminPaymentRoutes } from '@/modules/payments/admin.routes';
import { adminPaymentMethodRoutes } from '@/modules/payment-methods/admin.routes';
import { adminFeatureFlagRoutes } from '@/modules/feature-flags/admin.routes';
import { adminBusinessRuleRoutes } from '@/modules/business-rules/admin.routes';
import { adminCmsRoutes } from '@/modules/cms/admin.routes';
import { adminPlacementsRoutes } from '@/modules/placements/admin.routes';
import { adminShelfRoutes } from '@/modules/shelves/admin.routes';
import { adminBlogRoutes } from '@/modules/blog/admin.routes';
import { adminContentRoutes } from '@/modules/content/admin.routes';
import { adminInternRoutes } from '@/modules/intern/admin.routes';
import { adminInternPayoutRoutes } from '@/modules/payouts/routes';
import { adminLoyaltyRoutes } from '@/modules/loyalty/admin.routes';

/**
 * Composes every domain module's admin surface under a single auth gate.
 * Mount once at server.ts: `app.use('/api/admin', adminRouter)`.
 *
 * Each domain owns its admin endpoints (admin.routes.ts inside the
 * module folder). This file is purely composition — no business logic.
 */
export const adminRouter = Router();

// ADMIN gets the full admin surface; STAFF gets in here too but
// each sub-router checks its specific capability against
// `User.permissions[]` (audit H1). The frontend sidebar already
// filters items by capability — this layer is the API-side
// enforcement that backs it. ADMIN bypasses every requireCapability
// check by design.
adminRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// Phase 11.3 (audit H1): per-sub-router capability gates. Each
// sub-router is gated by the most permissive capability in the
// domain — if STAFF needs that, they have read-or-write access.
// Mutation handlers within each module can add inline tighter
// checks (e.g. `requireCapability('orders.refund')` on the refund
// endpoint) when they need to distinguish read vs write.
adminRouter.use('/products', requireCapability('products.write'), adminProductRoutes);
adminRouter.use('/brands', requireCapability('products.write'), adminBrandRoutes);
adminRouter.use('/categories', requireCapability('categories.write'), adminCategoryRoutes);
adminRouter.use('/reviews', requireCapability('reviews.moderate'), adminReviewRoutes);
adminRouter.use('/orders', requireCapability('orders.read'), adminOrderRoutes);
adminRouter.use('/customers', requireCapability('customers.read'), adminCustomerRoutes);
// Staff management — ADMIN-only inner gate. Even if a STAFF user
// somehow has `staff.manage` listed, we don't trust per-user grants
// for the high-blast-radius "create more staff" action.
adminRouter.use('/staff', requireRole('ADMIN'), adminStaffRoutes);
adminRouter.use('/coupons', requireCapability('coupons.write'), adminCouponRoutes);
adminRouter.use('/shipping', requireCapability('shipping.write'), adminShippingRoutes);
adminRouter.use('/settings', requireCapability('settings.write'), adminSettingsRoutes);
adminRouter.use('/audit-log', requireCapability('audit.read'), adminAuditRoutes);
adminRouter.use('/webhooks', requireCapability('webhooks.write'), adminWebhookRoutes);
adminRouter.use('/reports', requireCapability('reports.read'), adminReportRoutes);
adminRouter.use('/notifications', requireCapability('notifications.write'), adminNotificationRoutes);
adminRouter.use('/email-templates', requireCapability('email-templates.write'), adminEmailTemplateRoutes);
adminRouter.use('/custom-fields', requireCapability('custom-fields.write'), adminCustomFieldRoutes);
adminRouter.use('/payment-gateways', requireCapability('payment-gateways.write'), adminPaymentRoutes);
adminRouter.use('/payment-methods', requireCapability('payment-gateways.write'), adminPaymentMethodRoutes);
adminRouter.use('/feature-flags', requireCapability('feature-flags.write'), adminFeatureFlagRoutes);
adminRouter.use('/loyalty', requireCapability('loyalty.read'), adminLoyaltyRoutes);
adminRouter.use('/business-rules', requireCapability('business-rules.write'), adminBusinessRuleRoutes);
adminRouter.use('/pages', requireCapability('cms-pages.write'), adminCmsRoutes);
adminRouter.use('/blog', requireCapability('blog.write'), adminBlogRoutes);
adminRouter.use('/content', requireCapability('content.write'), adminContentRoutes);
// Intern queue uses its own narrow capability `products.image-only`.
// A regular STAFF with `products.write` can also reach it (via the
// admin UI), so we also let that capability through. The intern
// module already has internal scoping by `assignedInternId`.
adminRouter.use('/intern', adminInternRoutes);
/// Intern payouts — ADMIN-only at the router level (see payouts/routes.ts).
adminRouter.use('/intern-payouts', adminInternPayoutRoutes);
adminRouter.use('/placements', requireCapability('placements.write'), adminPlacementsRoutes);
adminRouter.use('/shelves', requireCapability('products.write'), adminShelfRoutes);
