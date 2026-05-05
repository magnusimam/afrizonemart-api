-- Add free-form jobTitle to User. Nullable, no default — existing users
-- come back as NULL until the admin sets one via the staff dialog.
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
