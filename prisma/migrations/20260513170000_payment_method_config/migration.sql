-- Tracker #46 — admin-editable payment methods + bank accounts.
-- See ARCHITECTURE_TRACKER.md item 46 for context.

-- 1. Enum + tables -------------------------------------------------

CREATE TYPE "PaymentMethodCode" AS ENUM (
    'CARD',
    'MOBILE_MONEY',
    'BANK_TRANSFER',
    'USSD',
    'CRYPTO',
    'PAY_ON_DELIVERY'
);

CREATE TABLE "PaymentMethodConfig" (
    "id"          TEXT NOT NULL,
    "code"        "PaymentMethodCode" NOT NULL,
    "label"       TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon"        TEXT NOT NULL,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "isPopular"   BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "details"     JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethodConfig_code_key" ON "PaymentMethodConfig"("code");
CREATE INDEX "PaymentMethodConfig_isActive_sortOrder_idx" ON "PaymentMethodConfig"("isActive", "sortOrder");

CREATE TABLE "PaymentBankAccount" (
    "id"            TEXT NOT NULL,
    "bankName"      TEXT NOT NULL,
    "accountName"   TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency"      TEXT NOT NULL,
    "country"       TEXT,
    "instructions"  TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentBankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentBankAccount_isActive_currency_idx" ON "PaymentBankAccount"("isActive", "currency");
CREATE INDEX "PaymentBankAccount_currency_country_idx" ON "PaymentBankAccount"("currency", "country");

-- 2. Seed the 6 current methods -----------------------------------
-- Defaults match the existing hardcoded copy in
-- src/lib/checkout-data.ts so the storefront's payment page looks
-- identical the moment the new code reads from this table.

INSERT INTO "PaymentMethodConfig" ("id", "code", "label", "description", "icon", "isActive", "isPopular", "sortOrder", "details", "createdAt", "updatedAt")
VALUES
  ('pmc_card_seed',
    'CARD',
    'Card',
    'Visa · Mastercard · Verve · American Express',
    'credit-card',
    true, true, 0,
    '{}'::jsonb,
    NOW(), NOW()),
  ('pmc_mm_seed',
    'MOBILE_MONEY',
    'Mobile Money',
    'M-Pesa · MTN MoMo · OPay · Orange Money · Vodafone Cash',
    'smartphone',
    true, true, 1,
    '{"providers":[
       {"code":"mpesa","name":"M-Pesa","countries":["KE","TZ","UG"]},
       {"code":"mtn-momo","name":"MTN MoMo","countries":["NG","GH","UG","RW","CM","CI"]},
       {"code":"airtel-money","name":"Airtel Money","countries":["KE","TZ","UG","RW","NG"]},
       {"code":"opay","name":"OPay","countries":["NG"]},
       {"code":"palmpay","name":"PalmPay","countries":["NG"]},
       {"code":"orange-money","name":"Orange Money","countries":["EG","ML","SN","CI"]},
       {"code":"vodafone-cash","name":"Vodafone Cash","countries":["EG","GH"]},
       {"code":"tigo-pesa","name":"Tigo Pesa","countries":["TZ"]},
       {"code":"snapscan","name":"SnapScan","countries":["ZA"]}
     ]}'::jsonb,
    NOW(), NOW()),
  ('pmc_bt_seed',
    'BANK_TRANSFER',
    'Bank Transfer',
    'Direct deposit to our verified Africa-wide accounts',
    'building-2',
    true, false, 2,
    '{}'::jsonb,
    NOW(), NOW()),
  ('pmc_ussd_seed',
    'USSD',
    'USSD / Bank Code',
    'Pay from your bank using a USSD code — no internet needed',
    'hash',
    true, false, 3,
    '{"codes":{
       "Access Bank":"*901*000*[Amount]#",
       "GTBank":"*737*000*[Amount]#",
       "Zenith Bank":"*966*000*[Amount]#",
       "First Bank":"*894*000*[Amount]#",
       "UBA":"*919*000*[Amount]#",
       "Sterling Bank":"*822*000*[Amount]#",
       "Fidelity Bank":"*770*000*[Amount]#"
     }}'::jsonb,
    NOW(), NOW()),
  ('pmc_crypto_seed',
    'CRYPTO',
    'Crypto',
    'BitCoin · USDT · ETH — instant settlement',
    'bitcoin',
    false, false, 4,
    '{"wallets":[]}'::jsonb,
    NOW(), NOW()),
  ('pmc_pod_seed',
    'PAY_ON_DELIVERY',
    'Pay on Delivery',
    'Cash or card at the doorstep — Lagos, Nairobi, Accra only',
    'truck',
    true, false, 5,
    '{"feeNgn":500,"cities":["Lagos","Nairobi","Accra"]}'::jsonb,
    NOW(), NOW());

-- Crypto starts inactive — there are no real wallet addresses yet,
-- so it stays hidden until admin adds at least one wallet row.

-- Bank accounts intentionally NOT seeded — Magnus fills in the real
-- GT account from /admin/payment-methods.
