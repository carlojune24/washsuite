import { select, execute } from "./db";
import type { CalibrationSession } from "../types";

/**
 * Ground-truth data collection for a future cycle-completion detection heuristic. A session
 * records every raw reading while active; ending it (the admin manually flagging that the
 * physical machine just finished) is the ground-truth label -- cycle duration varies by wash
 * setting, so it can't be inferred from elapsed time, only from what an admin actually observed.
 */
export async function startCalibrationSession(machineId: number): Promise<CalibrationSession> {
  const res = await execute("INSERT INTO machine_calibration_sessions (machine_id) VALUES (?)", [machineId]);
  const [session] = await select<CalibrationSession>("SELECT * FROM machine_calibration_sessions WHERE id = ?", [
    res.lastInsertId,
  ]);
  return session;
}

export async function endCalibrationSession(sessionId: number): Promise<void> {
  await execute("UPDATE machine_calibration_sessions SET ended_at = datetime('now') WHERE id = ?", [sessionId]);
}

export async function recordCalibrationSample(sessionId: number, reading: number): Promise<void> {
  await execute("INSERT INTO machine_calibration_samples (session_id, reading) VALUES (?, ?)", [
    sessionId,
    reading,
  ]);
}

export async function listCalibrationSessions(machineId: number): Promise<CalibrationSession[]> {
  return select<CalibrationSession>(
    "SELECT * FROM machine_calibration_sessions WHERE machine_id = ? ORDER BY started_at DESC",
    [machineId],
  );
}

export async function countCalibrationSamples(sessionId: number): Promise<number> {
  const [row] = await select<{ c: number }>(
    "SELECT COUNT(*) as c FROM machine_calibration_samples WHERE session_id = ?",
    [sessionId],
  );
  return row?.c ?? 0;
}

/**
 * Recomputes machine_sensors.running_baseline as the median reading across every sample from
 * every *ended* session for this machine, and writes it back. Always a full recompute (not an
 * incremental update) so it stays correct if sessions/samples ever change, and so it can backfill
 * sessions that were ended before this feature existed. Returns the computed median, or null if
 * there are no ended sessions yet.
 */
export async function syncRunningBaseline(machineId: number): Promise<number | null> {
  const rows = await select<{ reading: number }>(
    `SELECT s.reading FROM machine_calibration_samples s
     JOIN machine_calibration_sessions cs ON cs.id = s.session_id
     WHERE cs.machine_id = ? AND cs.ended_at IS NOT NULL
     ORDER BY s.reading`,
    [machineId],
  );
  if (rows.length === 0) return null;
  const mid = Math.floor(rows.length / 2);
  const median = rows.length % 2 === 0 ? (rows[mid - 1].reading + rows[mid].reading) / 2 : rows[mid].reading;
  await execute("UPDATE machine_sensors SET running_baseline = ? WHERE machine_id = ?", [median, machineId]);
  return median;
}
