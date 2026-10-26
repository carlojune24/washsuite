use axum::extract::{ConnectInfo, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, SameSite, SignedCookieJar};
use chrono::NaiveDate;
use serde_json::json;
use std::net::SocketAddr;
use uuid::Uuid;

use crate::auth::verify_password;
use crate::models::{DashboardSnapshotResponse, LoginRequest, SnapshotQuery};
use crate::AppState;

const SESSION_COOKIE: &str = "session";

/// POST /v1/dashboard/login -- the owner's only credential is a per-shop password set during
/// registration (see routes/register.rs). Rate-limited per (IP, shop_id) via state.rate_limiter
/// since a single shared password is otherwise guessable given enough attempts.
pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    jar: SignedCookieJar,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    if !state.rate_limiter.check(addr.ip(), req.shop_id) {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "error": "too_many_attempts", "message": "Try again in a minute." })),
        )
            .into_response();
    }

    let row = sqlx::query_as::<_, (String,)>("SELECT dashboard_password_hash FROM shops WHERE id = $1 AND enabled")
        .bind(req.shop_id)
        .fetch_optional(&state.db)
        .await;

    let hash = match row {
        Ok(Some((h,))) => h,
        Ok(None) => return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "invalid_credentials" }))).into_response(),
        Err(e) => {
            tracing::error!("login lookup failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response();
        }
    };

    if !verify_password(&req.password, &hash) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "invalid_credentials" }))).into_response();
    }

    // Served over HTTPS only (nginx + Let's Encrypt in front of this on washsuite.duckdns.org --
    // see deploy/), so `.secure(true)` is safe: the browser never has a plain-HTTP origin to send
    // this cookie to in the first place.
    let cookie = Cookie::build((SESSION_COOKIE, req.shop_id.to_string()))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::days(7))
        .build();

    (jar.add(cookie), Json(json!({ "ok": true }))).into_response()
}

/// POST /v1/dashboard/logout -- clears the session cookie. No auth check needed: removing a
/// cookie that was never set (or already expired) is a harmless no-op either way.
pub async fn logout(jar: SignedCookieJar) -> impl IntoResponse {
    (jar.remove(Cookie::from(SESSION_COOKIE)), Json(json!({ "ok": true }))).into_response()
}

type SnapshotRow = (Option<String>, Option<serde_json::Value>, Option<chrono::DateTime<chrono::Utc>>, Option<NaiveDate>);

/// GET /v1/dashboard/snapshot -- cookie-authenticated read of a shop's pushed snapshot. With no
/// `?date=` param, this is also what the dashboard's manual "Refresh" button re-calls and returns
/// the latest available day (not necessarily "today" -- right after UTC midnight today's row may
/// not have landed yet); freshness is bounded by how recently the shop PC last pushed (see
/// received_at), not by anything this endpoint does. With `?date=YYYY-MM-DD`, returns that day's
/// frozen snapshot for the dashboard's datepicker.
pub async fn get_snapshot(
    State(state): State<AppState>,
    Query(params): Query<SnapshotQuery>,
    jar: SignedCookieJar,
) -> impl IntoResponse {
    let shop_id = match jar.get(SESSION_COOKIE).and_then(|c| Uuid::parse_str(c.value()).ok()) {
        Some(id) => id,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "not_authenticated" }))).into_response(),
    };

    let requested_date = params.date.as_deref().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let row = if let Some(date) = requested_date {
        sqlx::query_as::<_, SnapshotRow>(
            r#"
            SELECT s.shop_name, ss.payload, ss.received_at, ss.snapshot_date
            FROM shops s
            LEFT JOIN shop_snapshots ss ON ss.shop_id = s.id AND ss.snapshot_date = $2
            WHERE s.id = $1 AND s.enabled
            "#,
        )
        .bind(shop_id)
        .bind(date)
        .fetch_optional(&state.db)
        .await
    } else {
        sqlx::query_as::<_, SnapshotRow>(
            r#"
            SELECT s.shop_name, ss.payload, ss.received_at, ss.snapshot_date
            FROM shops s
            LEFT JOIN LATERAL (
                SELECT payload, received_at, snapshot_date
                FROM shop_snapshots
                WHERE shop_id = s.id
                ORDER BY snapshot_date DESC
                LIMIT 1
            ) ss ON true
            WHERE s.id = $1 AND s.enabled
            "#,
        )
        .bind(shop_id)
        .fetch_optional(&state.db)
        .await
    };

    match row {
        Ok(Some((shop_name, payload, received_at, snapshot_date))) => (
            StatusCode::OK,
            Json(DashboardSnapshotResponse { shop_name, snapshot: payload, received_at, snapshot_date }),
        )
            .into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "not_found" }))).into_response(),
        Err(e) => {
            tracing::error!("snapshot lookup failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response()
        }
    }
}

/// GET /v1/dashboard/snapshot/dates -- cookie-authenticated list of calendar days this shop has
/// pushed data for, so the dashboard's datepicker can grey out days with nothing to show instead
/// of the user picking a date and hitting an empty state.
pub async fn get_snapshot_dates(State(state): State<AppState>, jar: SignedCookieJar) -> impl IntoResponse {
    let shop_id = match jar.get(SESSION_COOKIE).and_then(|c| Uuid::parse_str(c.value()).ok()) {
        Some(id) => id,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "not_authenticated" }))).into_response(),
    };

    let rows = sqlx::query_as::<_, (NaiveDate,)>(
        "SELECT snapshot_date FROM shop_snapshots WHERE shop_id = $1 ORDER BY snapshot_date DESC",
    )
    .bind(shop_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let dates: Vec<NaiveDate> = rows.into_iter().map(|(d,)| d).collect();
            (StatusCode::OK, Json(json!({ "dates": dates }))).into_response()
        }
        Err(e) => {
            tracing::error!("snapshot dates lookup failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response()
        }
    }
}
