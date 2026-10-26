-- Statutory rate is 20% (RA 9994 for seniors, RA 10754 for PWD) but kept configurable per
-- branch in case of future rate changes, rather than hardcoded in src/lib/vat.ts.
ALTER TABLE branches ADD COLUMN sc_pwd_discount_percent REAL NOT NULL DEFAULT 20;
