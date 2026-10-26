import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { select, execute } from "./db";
import type { Machine, MachineType, Esp32Device, MachineSensor, SensorChannel } from "../types";

/** A device's most recent reading -- mirrors `SensorReading` in src-tauri/src/sensors.rs. Only
 * the channels the board is actually configured for (1-4, see the setup portal) are present. */
export interface SensorReading {
  device_id: string;
  channels: Partial<Record<SensorChannel, number>>;
  ip_address: string;
  received_at_ms: number; // Date.now()-comparable, set by the Rust server on receipt
}

/** The fixed port both the app's ingest server and ESP32 firmware use -- mirrors INGEST_PORT
 * in src-tauri/src/sensors.rs. Never varies, unlike the IP, so it's a plain constant here. */
export const INGEST_PORT = 4390;

/** One of this machine's LAN-reachable IPv4 addresses -- mirrors `LocalAddress` in sensors.rs. */
export interface LocalAddress {
  interface: string;
  ip: string;
}

/** For display in Settings so the admin knows what to type into the ESP32's setup portal when
 * configuring a manual app IP (the "leave blank for auto" field) instead of relying on mDNS --
 * useful since a PC can be multi-homed (Ethernet + WiFi + a mobile hotspot), where mDNS can't be
 * relied on to advertise the one address the ESP32 can actually reach. */
export async function listLocalAddresses(): Promise<LocalAddress[]> {
  return invoke<LocalAddress[]>("list_local_addresses");
}

// ESP32 firmware is expected to post about once a second; anything older than a few missed
// beats reads as offline rather than merely "a bit stale".
export const ONLINE_WINDOW_MS = 5000;

export function isReadingOnline(reading: SensorReading | undefined): boolean {
  if (!reading) return false;
  return Date.now() - reading.received_at_ms < ONLINE_WINDOW_MS;
}

/** False on platforms the ingest server isn't compiled for (Android/iOS) -- see sensors.rs. */
export async function sensorServerAvailable(): Promise<boolean> {
  return invoke<boolean>("sensor_server_available");
}

/** Snapshot of every device's last reading, for populating the screen before the first live
 * event arrives (readings are only kept in memory on the Rust side, not persisted per-sample). */
export async function getLatestReadings(): Promise<SensorReading[]> {
  return invoke<SensorReading[]>("get_latest_readings");
}

export function subscribeToReadings(onReading: (reading: SensorReading) => void): Promise<UnlistenFn> {
  return listen<SensorReading>("sensor:reading", (event) => onReading(event.payload));
}

/**
 * Records that a device is alive and reachable. Inserting on first contact *is* the discovery
 * step -- there's no separate "pair this device" action, it just shows up here the moment it
 * POSTs its first reading -- otherwise this refreshes last_seen_at/ip_address for an existing row.
 */
export async function recordDeviceSeen(reading: SensorReading): Promise<void> {
  await execute(
    `INSERT INTO esp32_devices (device_id, ip_address, last_seen_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET ip_address = excluded.ip_address, last_seen_at = excluded.last_seen_at`,
    [reading.device_id, reading.ip_address],
  );
}

export async function listMachines(): Promise<Machine[]> {
  return select<Machine>("SELECT * FROM machines ORDER BY name");
}

export async function createMachine(name: string, type: MachineType): Promise<Machine> {
  const res = await execute("INSERT INTO machines (branch_id, name, type) VALUES (1, ?, ?)", [name, type]);
  const [machine] = await select<Machine>("SELECT * FROM machines WHERE id = ?", [res.lastInsertId]);
  return machine;
}

export async function updateMachine(id: number, name: string, type: MachineType): Promise<void> {
  await execute("UPDATE machines SET name = ?, type = ? WHERE id = ?", [name, type, id]);
}

export async function deleteMachine(id: number): Promise<void> {
  await execute("DELETE FROM machines WHERE id = ?", [id]);
}

export async function listEsp32Devices(): Promise<Esp32Device[]> {
  return select<Esp32Device>("SELECT * FROM esp32_devices ORDER BY device_id");
}

export async function listMachineSensors(): Promise<MachineSensor[]> {
  return select<MachineSensor>("SELECT * FROM machine_sensors");
}

/** Binds one ESP32 channel to a machine -- the actual "registration" step, meant to be called
 * once the admin has visually confirmed (via the live-identify flow) which physical sensor a
 * channel corresponds to. Fails if that machine or that channel is already bound (UNIQUE
 * constraints on machine_sensors), so a channel/machine can't silently be rebound by mistake. */
export async function registerMachineSensor(
  machineId: number,
  esp32DeviceId: number,
  channel: SensorChannel,
): Promise<void> {
  await execute("INSERT INTO machine_sensors (machine_id, esp32_device_id, channel) VALUES (?, ?, ?)", [
    machineId,
    esp32DeviceId,
    channel,
  ]);
}

export async function unregisterMachineSensor(id: number): Promise<void> {
  await execute("DELETE FROM machine_sensors WHERE id = ?", [id]);
}

/** Snapshots the current live reading as this machine's idle baseline -- called once, by hand,
 * while the admin has visually confirmed the machine is sitting idle right now. */
export async function setIdleBaseline(machineId: number, reading: number): Promise<void> {
  await execute("UPDATE machine_sensors SET idle_baseline = ? WHERE machine_id = ?", [reading, machineId]);
}
