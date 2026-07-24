-- Business/invoice info for BIR-style sales invoice printing (Settings > Branch),
-- a real sequential official-receipt number per order, and an optional customer TIN.
ALTER TABLE branches ADD COLUMN tin TEXT;
ALTER TABLE branches ADD COLUMN email TEXT;
ALTER TABLE branches ADD COLUMN bir_permit_no TEXT;
ALTER TABLE branches ADD COLUMN or_series_start INTEGER;
ALTER TABLE branches ADD COLUMN or_series_end INTEGER;
ALTER TABLE branches ADD COLUMN next_invoice_number INTEGER;
ALTER TABLE branches ADD COLUMN vat_registered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE branches ADD COLUMN invoice_terms TEXT DEFAULT 'Due upon receipt';

-- Assigned once, the first time an invoice is generated/printed for an order;
-- stays fixed on reprint so the same order never gets a second OR number.
ALTER TABLE orders ADD COLUMN invoice_number INTEGER;

ALTER TABLE customers ADD COLUMN tin TEXT;
