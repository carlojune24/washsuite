//! ESP32 sensor-reading ingest: a small local HTTP server ESP32 boards POST to, plus an mDNS
//! advertisement so they can find that server without a hardcoded IP. Runs on desktop and Android
//! (see Cargo.toml); the mDNS advertisement stays desktop-only -- Android blocks multicast
//! without a foreground service + multicast lock, which this pilot doesn't need since the ESP32
//! firmware's setup portal already supports a manual "WashSuite App IP" override that skips mDNS
//! entirely. On Android the listener only runs while the app is open/foregrounded -- there's no
//! foreground service keeping it alive across backgrounding, which this pilot doesn't need yet.
//!
//! Deliberately does no DB access: every other command in this app reads/writes SQLite from the
//! frontend via tauri-plugin-sql (see src/lib/db.ts), so readings are only kept in-memory here
//! and handed to the frontend via the "sensor:reading" event / get_latest_readings, which then
//! upserts esp32_devices itself -- same division of responsibility as everywhere else.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Fixed port the desktop app listens on and ESP32 firmware is configured to reach (directly, or
/// resolved via the "_washsuite._tcp.local." mDNS service this module advertises).
pub const INGEST_PORT: u16 = 4390;

#[derive(Clone, Serialize, Deserialize)]
pub struct SensorReading {
    pub device_id: String,
    /// Channel letter ("a".."d") -> raw ADC reading. Open-ended so boards configured for
    /// anywhere from 1 to 4 machines (see firmware/esp32_sensor_node) all POST the same shape --
    /// only the keys present differ.
    pub channels: HashMap<String, i64>,
    pub ip_address: String,
    /// Milliseconds since Unix epoch when this server received the reading -- lets the frontend
    /// show "online"/"stale" immediately from get_latest_readings, without waiting for a live
    /// event first.
    pub received_at_ms: u64,
}

#[derive(Default)]
pub struct SensorState {
    latest: Mutex<HashMap<String, SensorReading>>,
}

/// Lets the frontend know whether the sensor-ingest server is even compiled into this build, so
/// the Machines/Sensors screen can hide itself on platforms (Android) where it doesn't exist
/// instead of surfacing commands that error out.
#[tauri::command]
pub fn sensor_server_available() -> bool {
    cfg!(any(desktop, target_os = "android"))
}

/// Current snapshot of every device's last reading, for populating the live-identify screen the
/// moment it mounts (it also subscribes to "sensor:reading" for updates after that).
#[tauri::command]
pub fn get_latest_readings(state: tauri::State<SensorState>) -> Vec<SensorReading> {
    state.latest.lock().unwrap().values().cloned().collect()
}

#[derive(Serialize)]
pub struct LocalAddress {
    pub interface: String,
    pub ip: String,
}

/// This machine's own LAN-reachable IPv4 addresses, so the Machines/Sensors screen can show
/// "type this into the ESP32" instead of the admin having to go find it themselves (ipconfig
/// etc.) -- especially useful since a PC can easily be multi-homed (Ethernet + WiFi + a mobile
/// hotspot, as happened during development), where mDNS auto-discovery can't be relied on to
/// pick the one address the ESP32 can actually reach.
#[tauri::command]
pub fn list_local_addresses() -> Vec<LocalAddress> {
    #[cfg(any(desktop, target_os = "android"))]
    {
        if_addrs::get_if_addrs()
            .unwrap_or_default()
            .into_iter()
            .filter(|iface| !iface.is_loopback() && iface.ip().is_ipv4())
            .map(|iface| {
                let ip = iface.ip().to_string();
                LocalAddress { interface: iface.name, ip }
            })
            .collect()
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    {
        Vec::new()
    }
}

#[cfg(any(desktop, target_os = "android"))]
pub mod server {
    use super::{SensorReading, SensorState, INGEST_PORT};
    use axum::extract::{ConnectInfo, Request, State};
    use axum::http::StatusCode;
    use axum::middleware::{self, Next};
    use axum::response::Response;
    use axum::routing::post;
    use axum::{Json, Router};
    use serde::Deserialize;
    use std::collections::HashMap;
    use std::net::SocketAddr;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::{AppHandle, Emitter, Manager};

    #[derive(Deserialize)]
    struct IngestPayload {
        device_id: String,
        channels: HashMap<String, i64>,
    }

    async fn ingest(
        State(app): State<AppHandle>,
        ConnectInfo(addr): ConnectInfo<SocketAddr>,
        Json(payload): Json<IngestPayload>,
    ) -> StatusCode {
        let received_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let reading = SensorReading {
            device_id: payload.device_id,
            channels: payload.channels,
            ip_address: addr.ip().to_string(),
            received_at_ms,
        };

        // Sorted so repeated log lines from the same device are stable/diffable rather than
        // reordering every call (HashMap iteration order isn't stable).
        let mut channels: Vec<_> = reading.channels.iter().collect();
        channels.sort_by(|(a, _), (b, _)| a.cmp(b));
        let channels_str = channels.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join(" ");

        log::info!("sensor ingest: {} {channels_str} from {addr}", reading.device_id);

        let state = app.state::<SensorState>();
        state
            .latest
            .lock()
            .unwrap()
            .insert(reading.device_id.clone(), reading.clone());

        // Best-effort: no window may be listening yet (or ever, on a headless run), and that's
        // fine -- get_latest_readings still has this reading for the next poll.
        let _ = app.emit("sensor:reading", &reading);

        StatusCode::NO_CONTENT
    }

    /// Logs every request that reaches the router, success or not -- including ones the `Json`
    /// extractor in `ingest` rejects before its body ever runs (bad content-type, malformed
    /// JSON, wrong field names). Without this, a misbehaving ESP32 sketch produces total
    /// silence: the TCP connection succeeds, something arrives, and nothing in the log says so.
    async fn log_requests(req: Request, next: Next) -> Response {
        let method = req.method().clone();
        let uri = req.uri().clone();
        let peer = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.to_string())
            .unwrap_or_else(|| "unknown".into());
        let response = next.run(req).await;
        log::info!("sensor ingest: {method} {uri} from {peer} -> {}", response.status());
        response
    }

    /// Starts the ingest HTTP server and (desktop only) advertises it over mDNS as
    /// "_washsuite._tcp.local.". Runs for the lifetime of the app; failures are logged rather
    /// than propagated since a sensor outage shouldn't block the rest of WashSuite from starting.
    pub fn start(app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            let router = Router::new()
                .route("/ingest", post(ingest))
                .with_state(app.clone())
                .layer(middleware::from_fn(log_requests));

            let addr = SocketAddr::from(([0, 0, 0, 0], INGEST_PORT));
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    log::error!("sensor ingest server: couldn't bind port {INGEST_PORT}: {e}");
                    return;
                }
            };

            log::info!("sensor ingest server listening on {addr}");
            if let Err(e) = axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            {
                log::error!("sensor ingest server stopped: {e}");
            }
        });

        #[cfg(desktop)]
        match advertise_mdns() {
            Ok(()) => log::info!("sensor ingest: advertising _washsuite._tcp.local. on port {INGEST_PORT}"),
            Err(e) => log::error!("sensor ingest mDNS advertisement failed: {e}"),
        }
    }

    #[cfg(desktop)]
    fn advertise_mdns() -> Result<(), mdns_sd::Error> {
        let mdns = mdns_sd::ServiceDaemon::new()?;
        let service_info = mdns_sd::ServiceInfo::new(
            "_washsuite._tcp.local.",
            "washsuite",
            "washsuite.local.",
            "",
            INGEST_PORT,
            None,
        )?
        .enable_addr_auto();
        mdns.register(service_info)?;
        // Intentionally leaked: the daemon's background thread needs to keep running for the
        // life of the app, and there's no natural point at which WashSuite tears this down.
        std::mem::forget(mdns);
        Ok(())
    }
}
