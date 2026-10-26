import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  Cpu,
  Flag,
  Gauge,
  Link2,
  Pencil,
  PlayCircle,
  PlusCircle,
  Trash2,
  Unlink2,
  WashingMachine,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../components/ListRow";
import type { Machine, MachineType, Esp32Device, MachineSensor, SensorChannel, CalibrationSession } from "../types";
import { SENSOR_CHANNELS } from "../types";
import {
  sensorServerAvailable,
  getLatestReadings,
  subscribeToReadings,
  recordDeviceSeen,
  listMachines,
  createMachine,
  updateMachine,
  deleteMachine,
  listEsp32Devices,
  listMachineSensors,
  registerMachineSensor,
  unregisterMachineSensor,
  setIdleBaseline,
  isReadingOnline,
  listLocalAddresses,
  INGEST_PORT,
  type SensorReading,
  type LocalAddress,
} from "../lib/sensors";
import {
  startCalibrationSession,
  endCalibrationSession,
  recordCalibrationSample,
  listCalibrationSessions,
  syncRunningBaseline,
} from "../lib/calibration";
import { useMachineStatus } from "../lib/machineStatus";

// Avoid writing to esp32_devices on every ~1s reading -- only refresh a device's last_seen_at
// this often while its live values are on screen.
const RECORD_THROTTLE_MS = 5000;

type Tab = "setup" | "calibration";

export default function Machines() {
  const { refresh: refreshMachineStatus } = useMachineStatus();
  const [tab, setTab] = useState<Tab>("setup");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [devices, setDevices] = useState<Esp32Device[]>([]);
  const [bindings, setBindings] = useState<MachineSensor[]>([]);
  const [readings, setReadings] = useState<Record<string, SensorReading>>({});
  const [localAddresses, setLocalAddresses] = useState<LocalAddress[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [sessionsByMachine, setSessionsByMachine] = useState<Record<number, CalibrationSession[]>>({});
  const [runningBaselineByMachine, setRunningBaselineByMachine] = useState<Record<number, number | null>>({});
  const lastRecordedRef = useRef<Record<string, number>>({});
  // Reading events are subscribed to once (see the `available` effect below), so the callback
  // closure is frozen at that moment -- refs (not the state variables directly) are what let it
  // keep seeing live devices/bindings/sessions on every subsequent reading.
  const devicesRef = useRef<Esp32Device[]>([]);
  const bindingsRef = useRef<MachineSensor[]>([]);
  const sessionsByMachineRef = useRef<Record<number, CalibrationSession[]>>({});

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);
  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);
  useEffect(() => {
    sessionsByMachineRef.current = sessionsByMachine;
  }, [sessionsByMachine]);

  useEffect(() => {
    sensorServerAvailable()
      .then((ok) => setAvailable(ok))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (available !== true) return;

    refreshMachines();
    refreshDevices();
    refreshBindings();
    listLocalAddresses().then(setLocalAddresses);
    getLatestReadings().then((initial) => {
      const map: Record<string, SensorReading> = {};
      for (const r of initial) map[r.device_id] = r;
      setReadings(map);
    });

    let unlisten: (() => void) | undefined;
    subscribeToReadings(handleReading).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  // Bound machines' sessions aren't known until we've loaded bindings, so fetch them once
  // bindings are in (and again any time a binding changes -- a newly-bound machine needs its
  // session history loaded too).
  useEffect(() => {
    for (const b of bindings) refreshSessions(b.machine_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings]);

  function handleReading(reading: SensorReading) {
    setReadings((prev) => ({ ...prev, [reading.device_id]: reading }));

    const last = lastRecordedRef.current[reading.device_id] ?? 0;
    if (Date.now() - last >= RECORD_THROTTLE_MS) {
      lastRecordedRef.current[reading.device_id] = Date.now();
      const isNewDevice = !devicesRef.current.some((d) => d.device_id === reading.device_id);
      recordDeviceSeen(reading).then(() => {
        if (isNewDevice) refreshDevices();
      });
    }

    const deviceRow = devicesRef.current.find((d) => d.device_id === reading.device_id);
    if (!deviceRow) return;
    for (const [channel, value] of Object.entries(reading.channels)) {
      recordSampleIfActive(deviceRow.id, channel as SensorChannel, value);
    }
  }

  function recordSampleIfActive(esp32DeviceRowId: number, channel: SensorChannel, value: number) {
    const binding = bindingsRef.current.find((b) => b.esp32_device_id === esp32DeviceRowId && b.channel === channel);
    if (!binding) return;
    const active = sessionsByMachineRef.current[binding.machine_id]?.find((s) => s.ended_at === null);
    if (!active) return;
    recordCalibrationSample(active.id, value);
  }

  async function refreshMachines() {
    setMachines(await listMachines());
  }
  async function refreshDevices() {
    setDevices(await listEsp32Devices());
  }
  async function refreshBindings() {
    setBindings(await listMachineSensors());
  }
  async function refreshSessions(machineId: number) {
    const sessions = await listCalibrationSessions(machineId);
    setSessionsByMachine((prev) => ({ ...prev, [machineId]: sessions }));

    // Recomputed every time sessions load (not just right after ending one) so it backfills
    // sessions that were ended before this feature existed, without needing a rerun. Kept in its
    // own state rather than folded into refreshBindings() -- this runs inside the bindings-driven
    // effect below, so replacing `bindings` here would retrigger that same effect forever.
    const median = await syncRunningBaseline(machineId);
    setRunningBaselineByMachine((prev) => ({ ...prev, [machineId]: median }));
    // Always (not just when the median changed) -- this is also how the global provider learns
    // a calibration session just started or ended, which it needs to know right away so it stops
    // (or resumes) logging running->idle flips as real completed loads for this machine.
    refreshMachineStatus();
  }

  async function handleSetIdleBaseline(machineId: number, reading: number) {
    await setIdleBaseline(machineId, reading);
    await refreshBindings(); // safe here -- not inside the bindings-effect
    await refreshMachineStatus();
    toast.success("Idle baseline set");
  }

  async function handleStartSession(machineId: number) {
    await startCalibrationSession(machineId);
    await refreshSessions(machineId);
  }

  async function handleFlagCycleEnd(session: CalibrationSession) {
    await endCalibrationSession(session.id);
    await refreshSessions(session.machine_id);
    toast.success("Cycle end recorded");
  }

  const boundMachineIds = useMemo(() => new Set(bindings.map((b) => b.machine_id)), [bindings]);
  const unboundMachines = useMemo(() => machines.filter((m) => !boundMachineIds.has(m.id)), [machines, boundMachineIds]);
  const boundMachines = useMemo(() => machines.filter((m) => boundMachineIds.has(m.id)), [machines, boundMachineIds]);

  function bindingFor(deviceId: number, channel: SensorChannel) {
    return bindings.find((b) => b.esp32_device_id === deviceId && b.channel === channel);
  }
  function machineFor(binding: MachineSensor | undefined) {
    return binding ? machines.find((m) => m.id === binding.machine_id) : undefined;
  }

  function copyAppAddress(addr: LocalAddress) {
    navigator.clipboard.writeText(addr.ip);
    toast.success(`Copied ${addr.ip}`);
  }

  async function handleAddMachine(name: string, type: MachineType) {
    try {
      await createMachine(name, type);
      await refreshMachines();
      setShowAddMachine(false);
      toast.success(`${name} added`);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleEditMachine(id: number, name: string, type: MachineType) {
    try {
      await updateMachine(id, name, type);
      await refreshMachines();
      await refreshMachineStatus();
      setEditingMachine(null);
      toast.success(`${name} updated`);
    } catch (err) {
      toast.error(String(err));
    }
  }

  function confirmDeleteMachine(machine: Machine) {
    toast(`Remove ${machine.name}?`, {
      description: "This also unbinds any sensor registered to it.",
      action: {
        label: "Remove",
        onClick: async () => {
          await deleteMachine(machine.id);
          await Promise.all([refreshMachines(), refreshBindings()]);
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  }

  async function handleBind(deviceId: number, channel: SensorChannel, machineId: number) {
    try {
      await registerMachineSensor(machineId, deviceId, channel);
      await refreshBindings();
      toast.success("Sensor registered");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleUnbind(binding: MachineSensor) {
    await unregisterMachineSensor(binding.id);
    await refreshBindings();
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Machines & Sensors</h1>
      </div>

      {available === false && (
        <div className="rounded-2xl bg-surface p-3.5 text-sm text-ink/60 shadow-sm">
          Sensor registration isn't available on this device — it needs the desktop app, which is
          where ESP32 sensors report in.
        </div>
      )}

      {available === true && (
        <div className="mb-4 flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
          {(["setup", "calibration"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-colors " +
                (tab === t ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {t === "setup" ? "Setup" : "Calibration"}
            </button>
          ))}
        </div>
      )}

      {available === true && tab === "setup" && (
        <>
          <section className="mb-4">
            <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">App address</p>
            <p className="mb-2 px-1 text-xs text-ink/40">
              If an ESP32 can't find this app automatically, enter one of these into its setup
              portal's "WashSuite App IP" field instead. Use the one on the same network as the
              ESP32 (e.g. a mobile hotspot's address if that's what it's joined).
            </p>
            {localAddresses.length === 0 && <EmptyState text="No network addresses detected." />}
            <ul className="space-y-1.5">
              {localAddresses.map((addr) => (
                <li
                  key={addr.interface + addr.ip}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-semibold text-ink">
                      {addr.ip}
                      <span className="font-normal text-ink/40">:{INGEST_PORT}</span>
                    </p>
                    <p className="truncate text-xs text-ink/40">
                      {addr.interface} · enter just the IP (not the port) into the ESP32's "WashSuite App IP" field
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyAppAddress(addr)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-ink/50"
                    aria-label={`Copy ${addr.ip}`}
                  >
                    <Copy size={14} strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-4">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Machines</p>
              <button
                type="button"
                onClick={() => {
                  setEditingMachine(null);
                  setShowAddMachine((v) => !v);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white"
                aria-label="Add machine"
              >
                <PlusCircle size={15} strokeWidth={2.2} />
              </button>
            </div>

            {showAddMachine && (
              <MachineForm onSave={handleAddMachine} onCancel={() => setShowAddMachine(false)} submitLabel="Add" />
            )}

            {machines.length === 0 && !showAddMachine && <EmptyState text="No machines yet." />}

            <ul className="space-y-2">
              {machines.map((m) => {
                if (editingMachine?.id === m.id) {
                  return (
                    <li key={m.id}>
                      <MachineForm
                        initial={m}
                        onSave={(name, type) => handleEditMachine(m.id, name, type)}
                        onCancel={() => setEditingMachine(null)}
                        submitLabel="Save"
                      />
                    </li>
                  );
                }
                const binding = bindings.find((b) => b.machine_id === m.id);
                const device = binding ? devices.find((d) => d.id === binding.esp32_device_id) : undefined;
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                      <WashingMachine size={16} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                      <p className="truncate text-xs text-ink/50 capitalize">
                        {m.type}
                        {binding && device ? ` · sensor ${binding.channel.toUpperCase()} on ${shortDeviceLabel(device)}` : " · no sensor registered"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMachine(false);
                        setEditingMachine(m);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-ink/40"
                      aria-label={`Edit ${m.name}`}
                    >
                      <Pencil size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteMachine(m)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-ink/40"
                      aria-label={`Remove ${m.name}`}
                    >
                      <Trash2 size={14} strokeWidth={2.2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Devices</p>
            <p className="mb-2 px-1 text-xs text-ink/40">
              A new ESP32 shows up here automatically the first time it reports in — no setup needed
              beyond powering it on within reach of the network.
            </p>

            {devices.length === 0 && <EmptyState text="No devices have reported in yet." />}

            <ul className="space-y-2">
              {devices.map((d) => {
                const reading = readings[d.device_id];
                const online = isReadingOnline(reading);
                const selected = selectedDeviceId === d.id;
                return (
                  <li key={d.id} className="rounded-2xl bg-surface shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceId(selected ? null : d.id)}
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                        <Cpu size={16} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{shortDeviceLabel(d)}</p>
                        <p className="truncate text-xs text-ink/50">{d.ip_address ?? "unknown IP"}</p>
                      </div>
                      <span className={"flex items-center gap-1 text-xs font-semibold " + (online ? "text-emerald-600" : "text-ink/30")}>
                        {online ? <Wifi size={13} strokeWidth={2.2} /> : <WifiOff size={13} strokeWidth={2.2} />}
                        {online ? "Online" : "Offline"}
                      </span>
                    </button>

                    {selected && (
                      <div className="space-y-2 border-t border-ink/5 p-3">
                        {SENSOR_CHANNELS.filter(
                          (ch) => reading?.channels[ch] !== undefined || bindingFor(d.id, ch) !== undefined,
                        ).map((ch) => (
                          <ChannelRow
                            key={ch}
                            label={`Channel ${ch.toUpperCase()}`}
                            value={reading?.channels[ch]}
                            binding={bindingFor(d.id, ch)}
                            machine={machineFor(bindingFor(d.id, ch))}
                            unboundMachines={unboundMachines}
                            onBind={(machineId) => handleBind(d.id, ch, machineId)}
                            onUnbind={handleUnbind}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {available === true && tab === "calibration" && (
        <section>
          <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Cycle learning sessions
          </p>
          <p className="mb-2 px-1 text-xs text-ink/40">
            Record a machine's raw sensor readings while it runs, then flag the moment it
            actually finishes. This is ground-truth data for eventually detecting cycle
            completion for real, instead of guessing from a fixed threshold — cycle duration
            varies by wash setting, so it can't be estimated from elapsed time alone.
          </p>

          {boundMachines.length === 0 && (
            <EmptyState text="No machines have a sensor registered yet — set one up under Setup first." />
          )}

          <ul className="space-y-2">
            {boundMachines.map((m) => {
              const binding = bindings.find((b) => b.machine_id === m.id);
              const device = binding ? devices.find((d) => d.id === binding.esp32_device_id) : undefined;
              const reading = device ? readings[device.device_id] : undefined;
              const value = binding && reading ? reading.channels[binding.channel] : undefined;
              const sessions = sessionsByMachine[m.id] ?? [];
              const active = sessions.find((s) => s.ended_at === null);
              const past = sessions.filter((s) => s.ended_at !== null);

              return (
                <MachineCalibrationRow
                  key={m.id}
                  machine={m}
                  liveValue={value}
                  activeSession={active}
                  pastSessions={past}
                  sensor={binding}
                  runningBaseline={runningBaselineByMachine[m.id] ?? binding?.running_baseline ?? null}
                  onStart={() => handleStartSession(m.id)}
                  onFlagEnd={() => active && handleFlagCycleEnd(active)}
                  onSetIdleBaseline={() => value !== undefined && handleSetIdleBaseline(m.id, value)}
                />
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function shortDeviceLabel(d: Esp32Device) {
  return d.label ?? d.device_id;
}

// Same UTC-string convention as every other timestamp this app stores (see formatDateTime in
// lib/db.ts) -- SQLite's datetime('now') has no timezone marker, so a trailing "Z" is added
// before parsing to make sure it's read back as the UTC instant it actually is.
function parseUtc(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function MachineCalibrationRow({
  machine,
  liveValue,
  activeSession,
  pastSessions,
  sensor,
  runningBaseline,
  onStart,
  onFlagEnd,
  onSetIdleBaseline,
}: {
  machine: Machine;
  liveValue: number | undefined;
  activeSession: CalibrationSession | undefined;
  pastSessions: CalibrationSession[];
  sensor: MachineSensor | undefined;
  runningBaseline: number | null;
  onStart: () => void;
  onFlagEnd: () => void;
  onSetIdleBaseline: () => void;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  return (
    <li className="rounded-2xl bg-surface p-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
            (activeSession ? "bg-red-100 text-red-600" : "bg-brand-200/50 text-brand-600")
          }
        >
          <WashingMachine size={17} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{machine.name}</p>
          <p className="truncate text-xs text-ink/40">
            Live reading: <span className="font-mono">{liveValue ?? "—"}</span>
          </p>
        </div>
      </div>

      {activeSession ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/5 pt-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording · {formatDuration(Date.now() - parseUtc(activeSession.started_at).getTime())}
          </span>
          <button
            type="button"
            onClick={onFlagEnd}
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Flag size={13} strokeWidth={2.2} />
            Flag Cycle End
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/5 pt-3">
          <span className="text-xs text-ink/40">
            {pastSessions.length === 0
              ? "No sessions recorded yet"
              : `${pastSessions.length} session${pastSessions.length === 1 ? "" : "s"} recorded · last ${formatDuration(
                  parseUtc(pastSessions[0].ended_at!).getTime() - parseUtc(pastSessions[0].started_at).getTime(),
                )}`}
          </span>
          <button
            type="button"
            onClick={onStart}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <PlayCircle size={13} strokeWidth={2.2} />
            Start Learning Session
          </button>
        </div>
      )}

      {!activeSession && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink/5 pt-2">
          <span className="text-xs text-ink/40">
            {sensor?.idle_baseline != null
              ? `Idle: ${sensor.idle_baseline}${runningBaseline != null ? ` · Running: ${Math.round(runningBaseline)}` : " · Running: not yet"}`
              : "Idle baseline not set"}
          </span>
          <button
            type="button"
            disabled={liveValue === undefined}
            onClick={onSetIdleBaseline}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-page px-3 py-1.5 text-xs font-semibold text-ink/70 disabled:opacity-50"
          >
            <Gauge size={13} strokeWidth={2.2} />
            Set idle baseline
          </button>
        </div>
      )}
    </li>
  );
}

function MachineForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: Machine;
  onSave: (name: string, type: MachineType) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<MachineType>(initial?.type ?? "washer");

  return (
    <div className="mb-2 rounded-2xl bg-surface p-3 shadow-sm">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Washer 3"
        className="mb-2 w-full rounded-xl bg-page px-3 py-2 text-sm text-ink outline-none"
      />
      <div className="mb-2 flex gap-1.5 rounded-xl bg-page p-1.5">
        {(["washer", "dryer"] as MachineType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={
              "flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize " +
              (type === t ? "bg-brand-500 text-white" : "text-ink/50")
            }
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl bg-page py-2 text-xs font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), type)}
          className="flex-1 rounded-xl bg-brand-500 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function ChannelRow({
  label,
  value,
  binding,
  machine,
  unboundMachines,
  onBind,
  onUnbind,
}: {
  label: string;
  value: number | undefined;
  binding: MachineSensor | undefined;
  machine: Machine | undefined;
  unboundMachines: Machine[];
  onBind: (machineId: number) => void;
  onUnbind: (binding: MachineSensor) => void;
}) {
  const [pickedMachineId, setPickedMachineId] = useState<string>("");

  return (
    <div className="rounded-xl bg-page p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">{label}</span>
        <span className="font-mono text-sm text-ink/70">{value ?? "—"}</span>
      </div>

      {binding && machine ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink/50">Registered to {machine.name}</span>
          <button
            type="button"
            onClick={() => onUnbind(binding)}
            className="flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs font-semibold text-ink/60"
          >
            <Unlink2 size={12} strokeWidth={2.2} />
            Unbind
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <select
            value={pickedMachineId}
            onChange={(e) => setPickedMachineId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg bg-surface px-2 py-1.5 text-xs text-ink outline-none"
          >
            <option value="">
              {unboundMachines.length === 0 ? "No unregistered machines" : "Cover this sensor, then pick machine…"}
            </option>
            {unboundMachines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickedMachineId}
            onClick={() => {
              onBind(Number(pickedMachineId));
              setPickedMachineId("");
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Link2 size={12} strokeWidth={2.2} />
            Bind
          </button>
        </div>
      )}
    </div>
  );
}
