import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { requireRole } from '@/middleware/require-role';
import { adminProductRoutes } from '@/modules/products/admin.routes';
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
import { adminFeatureFlagRoutes } from '@/modules/feature-flags/admin.routes';
import { adminBusinessRuleRoutes } from '@/modules/business-rules/admin.routes';
import { adminCmsRoutes } from '@/modules/cms/admin.routes';
import { adminPlacementsRoutes } from '@/modules/placements/admin.routes';
import { adminBlogRoutes } from '@/modules/blog/admin.routes';
import { adminContentRoutes } from '@/modules/content/admin.routes';
import { adminInternRoutes } from '@/modules/intern/admin.routes';

/**
 * Composes every domain module's admin surface under a single auth gate.
 * Mount once at server.ts: `app.use('/api/admin', adminRouter)`.
 *
 * Each domain owns its admin endpoints (admin.routes.ts inside the
 * module folder). This file is purely composition — no business logic.
 */
export const adminRouter = Router();

// ADMIN gets the full admin surface; STAFF gets in here too but the
// frontend sidebar filters them down to their granted sections. The
// staff-management endpoints are separately gated to ADMIN-only below.
adminRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

adminRouter.use('/products', adminProductRoutes);
adminRouter.use('/categories', adminCategoryRoutes);
adminRouter.use('/reviews', adminReviewRoutes);
adminRouter.use('/orders', adminOrderRoutes);
adminRouter.use('/customers', adminCustomerRoutes);
// Staff management — ADMIN-only inner gate. Even if a STAFF user
// somehow has `staff.manage` listed, we don't trust per-user grants
// for the high-blast-radius "create more staff" action.
adminRouter.use('/staff', requireRole('ADMIN'), adminStaffRoutes);
adminRouter.use('/coupons', adminCouponRoutes);
adminRouter.use('/shipping', adminShippingRoutes);
adminRouter.use('/settings', adminSettingsRoutes);
adminRouter.use('/audit-log', adminAuditRoutes);
adminRouter.use('/webhooks', adminWebhookRoutes);
adminRouter.use('/reports', adminReportRoutes);
adminRouter.use('/notifications', adminNotificationRoutes);
adminRouter.use('/email-templates', adminEmailTemplateRoutes);
adminRouter.use('/custom-fields', adminCustomFieldRoutes);
adminRouter.use('/payment-gateways', adminPaymentRoutes);
adminRouter.use('/feature-flags', adminFeatureFlagRoutes);
adminRouter.use('/business-rules', adminBusinessRuleRoutes);
adminRouter.use('/pages', adminCmsRoutes);
adminRouter.use('/blog', adminBlogRoutes);
adminRouter.use('/content', adminContentRoutes);
adminRouter.use('/intern', adminInternRoutes);
adminRouter.use('/placements', adminPlacementsRoutes);
