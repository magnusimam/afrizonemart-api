-- Magnus chose "every product in catalog" for the new intern quick-
-- edit feature (name + price edits from the intern list view). Existing
-- intern accounts have `products.image-only` in their permissions but
-- not `products.write` — so they couldn't hit PATCH /api/admin/products
-- /:id until we backfill. Idempotent: only appends to users that lack
-- the capability.
--
-- New interns going forward need `products.write` granted explicitly
-- via /admin/staff so the trust shift stays visible — we don't auto-
-- grant in the staff creation flow.

UPDATE "User"
SET "permissions" = "permissions" || ARRAY['products.write']
WHERE 'products.image-only' = ANY("permissions")
  AND NOT 'products.write' = ANY("permissions");
