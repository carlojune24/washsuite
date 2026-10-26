-- Per-order VAT treatment (BIR RR 7-2024) and senior citizen / PWD statutory discount
-- (RA 9994 / RA 10754): SC/PWD sales are VAT-exempt with a 20% discount applied to the
-- VAT-exclusive amount, and cannot be combined with promo/loyalty discounts.
ALTER TABLE orders ADD COLUMN vat_status TEXT NOT NULL DEFAULT 'vatable'
  CHECK (vat_status IN ('vatable','vat_exempt','zero_rated'));
ALTER TABLE orders ADD COLUMN sc_pwd_id_no TEXT;
ALTER TABLE orders ADD COLUMN sc_pwd_name TEXT;
ALTER TABLE orders ADD COLUMN sc_pwd_discount_amount REAL NOT NULL DEFAULT 0;
