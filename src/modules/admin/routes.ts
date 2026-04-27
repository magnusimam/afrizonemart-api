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
import { adminNotificationRoutes } from '@/modules/notifications/admin.routes';

/**
 * Composes every domain module's admin surface under a single auth gate.
 * Mount once at server.ts: `app.use('/api/admin', adminRouter)`.
 *
 * Each domain owns its admin endpoints (admin.routes.ts inside the
 * module folder). This file is purely composition — no business logic.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.use('/products', adminProductRoutes);
adminRouter.use('/categories', adminCategoryRoutes);
adminRouter.use('/reviews', adminReviewRoutes);
adminRouter.use('/orders', adminOrderRoutes);
adminRouter.use('/customers', adminCustomerRoutes);
adminRouter.use('/staff', adminStaffRoutes);
adminRouter.use('/coupons', adminCouponRoutes);
adminRouter.use('/shipping', adminShippingRoutes);
adminRouter.use('/settings', adminSettingsRoutes);
adminRouter.use('/audit-log', adminAuditRoutes);
adminRouter.use('/webhooks', adminWebhookRoutes);
adminRouter.use('/reports', adminReportRoutes);
adminRouter.use('/notifications', adminNotificationRoutes);
