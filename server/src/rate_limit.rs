use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

const WINDOW: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 5;

/// Blunt-instrument in-memory login throttle, scoped per (client IP, shop_id) so one guessed
/// password attempt against shop A doesn't lock out a legitimate login to shop B from the same
/// NAT'd IP. Resets on process restart -- acceptable for a single-instance MVP; would need a
/// shared store (Redis, or a DB table) if this ever runs behind more than one instance.
#[derive(Default)]
pub struct RateLimiter {
    attempts: Mutex<HashMap<(IpAddr, Uuid), Vec<Instant>>>,
}

impl RateLimiter {
    /// Returns true if this attempt is allowed (and records it). Returns false if the caller
    /// has already hit MAX_ATTEMPTS within WINDOW.
    pub fn check(&self, ip: IpAddr, shop_id: Uuid) -> bool {
        let mut map = self.attempts.lock().unwrap();
        let now = Instant::now();
        let entry = map.entry((ip, shop_id)).or_default();
        entry.retain(|t| now.duration_since(*t) < WINDOW);
        if entry.len() >= MAX_ATTEMPTS {
            false
        } else {
            entry.push(now);
            true
        }
    }
}
