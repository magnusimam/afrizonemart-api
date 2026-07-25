-- Structured department label for STAFF accounts (Marketing, Finance,
-- Operations, Communications, ...). Cosmetic + preset-trigger only;
-- access is still governed by User.permissions.
ALTER TABLE "User" ADD COLUMN "department" TEXT;
