-- Start time of each detected cycle, alongside the existing completed_at, so the owner can see
-- how long a sensor-detected load actually ran instead of only when it finished. Nullable since
-- rows logged before this column existed have no recorded start time.
ALTER TABLE machine_cycle_logs ADD COLUMN started_at TEXT;
