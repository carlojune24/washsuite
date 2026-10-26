use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use chrono::{NaiveDate, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::{extract_bearer, hash_token};
use crate::AppState;

/// How long a shop's per-day snapshot history is kept around. Pruned opportunistically on each
/// ingest (a shop that's actively pushing, every ~45s, prunes itself on every push) *and* by a
/// daily sweep in main.rs that catches shops which have stopped pushing altogether (disabled,
/// uninstalled) and would otherwise never get cleaned up.
pub(crate) const SNAPSHOT_RETENTION_DAYS: i64 = 7;

/// POST /v1/snapshots -- the shop PC's periodic (or manual "Sync now") push. Deliberately dumb:
/// the payload is stored as opaque JSONB and handed back as-is by the dashboard endpoint. This
/// server doesn't interpret sales/cashflow/attendance/machine numbers -- that logic already lives
/// correctly in the Tauri app's own SQL queries; duplicating it here would be a second place for
/// it to drift out of sync.
pub async fn ingest(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<Value>) -> impl IntoResponse {
    let token = match extract_bearer(&headers) {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "missing_token" }))).into_response(),
    };
    let token_hash = hash_token(&token);

    let shop = sqlx::query_as::<_, (Uuid, bool)>("SELECT id, enabled FROM shops WHERE api_token_hash = $1")
        .bind(&token_hash)
        .fetch_optional(&state.db)
        .await;

    let (shop_id, enabled) = match shop {
        Ok(Some(row)) => row,
        Ok(None) => return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "invalid_token" }))).into_response(),
        Err(e) => {
            tracing::error!("ingest token lookup failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response();
        }
    };

    if !enabled {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "shop_disabled" }))).into_response();
    }

    let snapshot_date = payload
        .get("snapshot_date")
        .and_then(Value::as_str)
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());

    let result = sqlx::query(
        r#"
        INSERT INTO shop_snapshots (shop_id, snapshot_date, payload, received_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (shop_id, snapshot_date) DO UPDATE SET payload = EXCLUDED.payload, received_at = now()
        "#,
    )
    .bind(shop_id)
    .bind(snapshot_date)
    .bind(&payload)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let _ = sqlx::query("UPDATE shops SET last_snapshot_at = now() WHERE id = $1")
                .bind(shop_id)
                .execute(&state.db)
                .await;

            if let Err(e) = sqlx::query(
                "DELETE FROM shop_snapshots WHERE shop_id = $1 AND snapshot_date < CURRENT_DATE - $2::int",
            )
            .bind(shop_id)
            .bind(SNAPSHOT_RETENTION_DAYS as i32)
            .execute(&state.db)
            .await
            {
                tracing::warn!("snapshot retention prune failed for shop {shop_id}: {e}");
            }

            (StatusCode::OK, Json(json!({ "received_at": Utc::now() }))).into_response()
        }
        Err(e) => {
            tracing::error!("ingest insert failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response()
        }
    }
}
