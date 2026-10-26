import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { select, execute } from "./db";
import type { Machine, MachineSensor, Esp32Device, SensorChannel } from "../types";
import { sensorServerAvailable, getLatestReadings, subscribeToReadings, ONLINE_WINDOW_MS, type SensorReading } from "./sensors";
import { localDate } from "./localDate";

/**
 * Raw ADC value (0-4095) above which a channel counts as "running", used only as a fallback for
 * machines that don't have both machine_sensors.idle_baseline and running_baseline set yet (see
 * thresholdFor below for the real per-machine calculation once calibration data exists).
 */
const RUNNING_THRESHOLD = 1500;

// How many recent raw readings to keep per machine for the live chart on Machine Status --
// readings arrive ~1/sec, so 180 is about 3 minutes of history. Capped (not persisted) since
// it's purely a "what's happening right now" view, not historical data.
const READING_HISTORY_LENGTH = 180;

export type RunStatus = "running" | "idle";

export interface MachineRuntimeStatus {
  status: RunStatus;
  reading: number;
  loadsToday: number;
  lastReadingAt: number | null; // epoch ms -- online/offline is derived from how stale this is
  runningSince: number | null; // epoch ms, when the *current* running streak began
  idleSince: number | null; // epoch ms, when the *current* idle streak began
  lastUsedAt: string | null; // DB-format UTC timestamp, most recent transition into running -- persists across restarts (seeded from machine_cycle_logs), unlike the epoch-ms fields above
}

export interface ReadingPoint {
  t: number; // epoch ms
  v: number; // raw ADC value, 0-4095
}

interface MachineStatusContextValue {
  available: boolean;
  machines: Machine[];
  statuses: Record<number, MachineRuntimeStatus>; // keyed by machine_id
  sensorByMachine: Record<number, MachineSensor>; // keyed by machine_id -- idle_baseline/running_baseline for chart reference lines
  readingHistory: Record<number, ReadingPoint[]>; // keyed by machine_id, most recent READING_HISTORY_LENGTH readings
  refresh: () => Promise<void>;
}

const MachineStatusContext = createContext<MachineStatusContextValue | null>(null);

function today() {
  return localDate(new Date());
}

function dbString(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace("T", " ");
}

function nowDbString() {
  return dbString(Date.now());
}

export function isMachineOnline(status: MachineRuntimeStatus | undefined): boolean {
  if (!status?.lastReadingAt) return false;
  return Date.now() - status.lastReadingAt < ONLINE_WINDOW_MS;
}

/**
 * Mounted once at the app root (see App.tsx) so load counting keeps working no matter which
 * page is open -- it isn't scoped to the Machine Status page itself. Watches every sensor
 * reading for the lifetime of the app, and on a running->idle transition for a bound channel,
 * logs a completed load.
 */
export function MachineStatusProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [statuses, setStatuses] = useState<Record<number, MachineRuntimeStatus>>({});
  const [sensorByMachine, setSensorByMachine] = useState<Record<number, MachineSensor>>({});
  const [readingHistory, setReadingHistory] = useState<Record<number, ReadingPoint[]>>({});
  const bindingByKeyRef = useRef<Record<string, number>>({}); // `${device_id}:${channel}` -> machine_id
  const sensorByMachineRef = useRef<Record<number, MachineSensor>>({}); // machine_id -> its machine_sensors row -- mirrors sensorByMachine state, but a ref so applyChannel's synchronous threshold lookup always sees the latest value without waiting on a re-render
  const calibratingMachineIdsRef = useRef<Set<number>>(new Set()); // machines with an active (unended) calibration session right now
  const lastStatusRef = useRef<Record<number, RunStatus>>({}); // machine_id -> last known status
  // machine_id -> epoch ms when the *current* running streak began, or null while idle. A ref
  // (not read from `statuses` state) because it must be available synchronously before the
  // machine_cycle_logs INSERT below, which happens outside of -- and before -- the setStatuses
  // updater that would otherwise hold this value.
  const runningSinceRef = useRef<Record<number, number | null>>({});

  useEffect(() => {
    sensorServerAvailable()
      .then((ok) => {
        setAvailable(ok);
        if (ok) refresh();
      })
      .catch(() => setAvailable(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!available) return;
    let unlisten: (() => void) | undefined;
    subscribeToReadings((reading) => applyReading(reading)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  async function refresh() {
    const [machineRows, sensorRows, deviceRows, todayLogs, lastUsedRows, activeCalibrationRows] = await Promise.all([
      select<Machine>("SELECT * FROM machines ORDER BY name"),
      select<MachineSensor>("SELECT * FROM machine_sensors"),
      select<Esp32Device>("SELECT * FROM esp32_devices"),
      select<{ machine_id: number; c: number }>(
        "SELECT machine_id, COUNT(*) as c FROM machine_cycle_logs WHERE cycle_date = ? GROUP BY machine_id",
        [today()],
      ),
      select<{ machine_id: number; last_completed: string }>(
        "SELECT machine_id, MAX(completed_at) as last_completed FROM machine_cycle_logs GROUP BY machine_id",
      ),
      select<{ machine_id: number }>("SELECT DISTINCT machine_id FROM machine_calibration_sessions WHERE ended_at IS NULL"),
    ]);

    calibratingMachineIdsRef.current = new Set(activeCalibrationRows.map((r) => r.machine_id));

    const deviceRowIdToDeviceId: Record<number, string> = {};
    for (const d of deviceRows) deviceRowIdToDeviceId[d.id] = d.device_id;

    const bindingByKey: Record<string, number> = {};
    for (const s of sensorRows) {
      const deviceId = deviceRowIdToDeviceId[s.esp32_device_id];
      if (!deviceId) continue;
      bindingByKey[`${deviceId}:${s.channel}`] = s.machine_id;
    }
    bindingByKeyRef.current = bindingByKey;

    const sensorByMachineMap: Record<number, MachineSensor> = {};
    for (const s of sensorRows) sensorByMachineMap[s.machine_id] = s; // machine_sensors.machine_id is UNIQUE
    sensorByMachineRef.current = sensorByMachineMap;
    setSensorByMachine(sensorByMachineMap);

    const loadsByMachine: Record<number, number> = {};
    for (const row of todayLogs) loadsByMachine[row.machine_id] = row.c;

    const lastUsedByMachine: Record<number, string> = {};
    for (const row of lastUsedRows) if (row.last_completed) lastUsedByMachine[row.machine_id] = row.last_completed;

    setMachines(machineRows);
    setStatuses((prev) => {
      const next: Record<number, MachineRuntimeStatus> = {};
      for (const m of machineRows) {
        next[m.id] = {
          status: prev[m.id]?.status ?? "idle",
          reading: prev[m.id]?.reading ?? 0,
          loadsToday: loadsByMachine[m.id] ?? 0,
          lastReadingAt: prev[m.id]?.lastReadingAt ?? null,
          runningSince: prev[m.id]?.runningSince ?? null,
          idleSince: prev[m.id]?.idleSince ?? null,
          lastUsedAt: prev[m.id]?.lastUsedAt ?? lastUsedByMachine[m.id] ?? null,
        };
      }
      return next;
    });

    // Seed from the ingest server's current in-memory snapshot too, in case readings arrived
    // before this refresh ran (e.g. the app just opened and sensors were already reporting).
    const latest = await getLatestReadings();
    for (const reading of latest) applyReading(reading);
  }

  function applyReading(reading: SensorReading) {
    for (const [channel, value] of Object.entries(reading.channels)) {
      applyChannel(reading.device_id, channel as SensorChannel, value);
    }
  }

  function thresholdFor(machineId: number): number {
    const s = sensorByMachineRef.current[machineId];
    if (s?.idle_baseline != null && s?.running_baseline != null) {
      return (s.idle_baseline + s.running_baseline) / 2;
    }
    return RUNNING_THRESHOLD;
  }

  function applyChannel(deviceId: string, channel: SensorChannel, value: number) {
    const machineId = bindingByKeyRef.current[`${deviceId}:${channel}`];
    if (machineId === undefined) return;

    const now = Date.now();
    const status: RunStatus = value > thresholdFor(machineId) ? "running" : "idle";
    const previous = lastStatusRef.current[machineId];
    lastStatusRef.current[machineId] = status;
    const justCompletedLoad = previous === "running" && status === "idle";
    // Excludes the very first reading ever seen for a machine (previous === undefined) -- we
    // don't actually know it "just" started then, it may have been running for a while already.
    const justStarted = previous !== undefined && previous !== "running" && status === "running";
    // While an admin is running a calibration session on this machine, running/idle flips are
    // deliberate test behavior (covering/uncovering the sensor, etc.), not a real customer load
    // -- logging them here would pollute machine_cycle_logs and inflate the owner's declared-vs-
    // sensor-detected verification report with cycles nobody actually paid for.
    const calibrating = calibratingMachineIdsRef.current.has(machineId);
    const shouldLogLoad = justCompletedLoad && !calibrating;
    const startedAtMs = runningSinceRef.current[machineId] ?? null; // set when this now-ending streak began

    runningSinceRef.current[machineId] = status === "running" ? (runningSinceRef.current[machineId] ?? now) : null;

    if (shouldLogLoad) {
      execute(
        "INSERT INTO machine_cycle_logs (machine_id, cycle_date, started_at) VALUES (?, ?, ?)",
        [machineId, today(), startedAtMs != null ? dbString(startedAtMs) : null],
      );
    }

    setReadingHistory((prev) => {
      const history = prev[machineId] ?? [];
      const next = [...history, { t: now, v: value }];
      if (next.length > READING_HISTORY_LENGTH) next.shift();
      return { ...prev, [machineId]: next };
    });

    setStatuses((prev) => {
      const current = prev[machineId];
      return {
        ...prev,
        [machineId]: {
          status,
          reading: value,
          loadsToday: (current?.loadsToday ?? 0) + (shouldLogLoad ? 1 : 0),
          lastReadingAt: now,
          runningSince: status === "running" ? (current?.runningSince ?? now) : null,
          idleSince: status === "idle" ? (current?.idleSince ?? now) : null,
          lastUsedAt: justStarted ? nowDbString() : (current?.lastUsedAt ?? null),
        },
      };
    });
  }

  return (
    <MachineStatusContext.Provider
      value={{ available, machines, statuses, sensorByMachine, readingHistory, refresh }}
    >
      {children}
    </MachineStatusContext.Provider>
  );
}

export function useMachineStatus(): MachineStatusContextValue {
  const ctx = useContext(MachineStatusContext);
  if (!ctx) throw new Error("useMachineStatus must be used within a MachineStatusProvider");
  return ctx;
}
