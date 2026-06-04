-- AlterEnum
-- Postgres requires enum value additions in a separate tx; runs cleanly
-- against an existing DB without locking the OrderStatus column.
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY' AFTER 'SHIPPED';
