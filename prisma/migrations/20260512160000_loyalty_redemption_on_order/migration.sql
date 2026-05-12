-- Continental Rewards PR 3 — order-level coin redemption columns.
-- coinsRedeemed = how many coins were applied to this order.
-- coinDiscount = NGN value of that redemption (coins × coinValueNgn
-- snapshot at order time). PR 4 reads coinsRedeemed for refund
-- clawback so the customer gets exactly the coins back they paid.

ALTER TABLE "Order"
  ADD COLUMN "coinsRedeemed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coinDiscount" INTEGER NOT NULL DEFAULT 0;
