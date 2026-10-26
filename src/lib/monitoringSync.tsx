import { useEffect, useRef } from "react";
import { useMachineStatus, isMachineOnline, type MachineRuntimeStatus } from "./machineStatus";
import type { Machine } from "../types";
import { loadMonitoringState, pushSnapshotNow, type MonitoringMachineEntry, type MonitoringSnapshotMachines } from "./monitoring";

const SYNC_INTERVAL_MS = 45_000;

export function buildMachinesBlock(
  machines: Machine[],
  statuses: Record<number, MachineRuntimeStatus>,
): MonitoringSnapshotMachines {
  let totalLoadsToday = 0;
  const entries: MonitoringMachineEntry[] = machines.map((m) => {
    const s = statuses[m.id];
    const online = isMachineOnline(s);
    const loadsToday = s?.loadsToday ?? 0;
    totalLoadsToday += loadsToday;
    return {
      machine_id: m.id,
      name: m.name,
      type: m.type,
      status: online && s ? s.status : "offline",
      loads_today: loadsToday,
      last_used_at: s?.lastUsedAt ?? null,
    };
  });
  return { total_loads_today: totalLoadsToday, machines: entries };
}

/**
 * Mounted once at the app root, inside <MachineStatusProvider> (see App.tsx), so it can read live
 * running/idle state -- that data only exists in MachineStatusProvider's in-memory context, never
 * persisted per-reading to SQLite. Renders nothing; just ticks a background push on an interval
 * when monitoring is enabled. The "Sync now" button in OnlineMonitoringSettings.tsx calls
 * pushSnapshotNow directly for an immediate, user-triggered push outside this cadence.
 */
export function MonitoringSync() {
  const { machines, statuses } = useMachineStatus();
  const machinesRef = useRef(machines);
  const statusesRef = useRef(statuses);
  machinesRef.current = machines;
  statusesRef.current = statuses;
  const inFlightRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (inFlightRef.current) return;
      const state = await loadMonitoringState();
      if (!state || !state.enabled) return;

      inFlightRef.current = true;
      try {
        await pushSnapshotNow(buildMachinesBlock(machinesRef.current, statusesRef.current));
      } catch {
        // Already recorded in monitoring_state by pushSnapshotNow -- nothing else to do here,
        // the next tick (or a manual "Sync now") will simply try again.
      } finally {
        inFlightRef.current = false;
      }
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return null;
}
