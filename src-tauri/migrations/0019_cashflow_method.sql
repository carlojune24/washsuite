-- Payment method per cashflow entry, so Cashflow can show a "cash on hand by method" breakdown
-- (Cash / GCash / Card / Bank Transfer). Nullable — existing entries predate this and stay
-- "uncategorized" rather than being guessed at.
ALTER TABLE cashflow_entries ADD COLUMN method TEXT;
