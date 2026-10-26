mod auth;
mod config;
mod db;
mod license_client;
mod models;
mod rate_limit;
mod routes;

use axum::extract::FromRef;
use axum::response::Html;
use axum::routing::{get, post};
use axum::Router;
use axum_extra::extract::cookie::Key;
use sha2::{Digest, Sha512};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Arc<config::Config>,
    pub cookie_key: Key,
    pub rate_limiter: Arc<rate_limit::RateLimiter>,
}

impl FromRef<AppState> for Key {
    fn from_ref(state: &AppState) -> Self {
        state.cookie_key.clone()
    }
}

/// Stretches SESSION_SECRET (any length) to the 64 bytes `cookie::Key::from` requires, so a
/// short/malformed env var can't panic the process at startup -- it just derives a key.
fn derive_cookie_key(secret: &str) -> Key {
    let mut hasher = Sha512::new();
    hasher.update(secret.as_bytes());
    Key::from(&hasher.finalize())
}

const SNAPSHOT_BODY_LIMIT_BYTES: usize = 256 * 1024;

/// Daily sweep for snapshot history left behind by shops that have stopped pushing (disabled,
/// uninstalled, etc.) -- routes::ingest's per-push prune only cleans up a shop's own rows when
/// *that* shop pushes, so an abandoned shop's history would otherwise sit there forever. Runs
/// immediately on startup too (tokio::time::interval fires its first tick right away), so a
/// restart also catches up on any backlog.
fn spawn_snapshot_retention_sweep(db: sqlx::PgPool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60));
        loop {
            interval.tick().await;
            match sqlx::query("DELETE FROM shop_snapshots WHERE snapshot_date < CURRENT_DATE - $1::int")
                .bind(routes::ingest::SNAPSHOT_RETENTION_DAYS as i32)
                .execute(&db)
                .await
            {
                Ok(r) => tracing::info!("snapshot retention sweep removed {} row(s)", r.rows_affected()),
                Err(e) => tracing::warn!("snapshot retention sweep failed: {e}"),
            }
        }
    });
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let config = Arc::new(config::Config::from_env());
    let pool = db::connect(&config.database_url).await;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations failed");

    let cookie_key = derive_cookie_key(&config.session_secret);
    let bind_addr = config.bind_addr.clone();

    let state = AppState {
        db: pool,
        config,
        cookie_key,
        rate_limiter: Arc::new(rate_limit::RateLimiter::default()),
    };

    spawn_snapshot_retention_sweep(state.db.clone());

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        // index.html is a client-side router over one static document (landing / login /
        // dashboard -- see its own route()/navigate()). Serving that same document at /login and
        // /dashboard too, not just /, means a full page load or refresh on either lands on the
        // right screen instead of 404ing, the way a real server-rendered route would.
        .route("/", get(|| async { Html(include_str!("../web/index.html")) }))
        .route("/login", get(|| async { Html(include_str!("../web/index.html")) }))
        .route("/dashboard", get(|| async { Html(include_str!("../web/index.html")) }))
        .route("/v1/register", post(routes::register::register))
        .route(
            "/v1/snapshots",
            post(routes::ingest::ingest).layer(RequestBodyLimitLayer::new(SNAPSHOT_BODY_LIMIT_BYTES)),
        )
        .route("/v1/dashboard/login", post(routes::dashboard::login))
        .route("/v1/dashboard/logout", post(routes::dashboard::logout))
        .route("/v1/dashboard/snapshot", get(routes::dashboard::get_snapshot))
        .route("/v1/dashboard/snapshot/dates", get(routes::dashboard::get_snapshot_dates))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await.expect("bind failed");
    tracing::info!("washsuite-monitor listening on {bind_addr}");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("server error");
}
