use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;
use uuid::Uuid;

use crate::auth::{generate_api_token, hash_password, hash_token};
use crate::license_client::validate_license;
use crate::models::{RegisterRequest, RegisterResponse};
use crate::AppState;

/// POST /v1/register -- turns a (license_key, machine_fingerprint) pair into a scoped API token
/// for pushing snapshots, plus a dashboard password for the owner to view them. Never trusts the
/// client's self-reported license validity: re-checks against the same Supabase validate-license
/// edge function the Tauri app itself calls, server-to-server, before issuing anything.
pub async fn register(State(state): State<AppState>, Json(req): Json<RegisterRequest>) -> impl IntoResponse {
    let license_key = req.license_key.trim();
    if license_key.is_empty() || req.machine_fingerprint.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "missing_fields" }))).into_response();
    }
    if req.dashboard_password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "weak_password", "message": "Dashboard password must be at least 8 characters." })),
        )
            .into_response();
    }

    let check = match validate_license(
        &state.config.supabase_validate_url,
        license_key,
        &req.machine_fingerprint,
        &req.app_version,
    )
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("license validation unreachable: {e}");
            return (StatusCode::BAD_GATEWAY, Json(json!({ "error": "license_server_unreachable" }))).into_response();
        }
    };

    if !check.valid {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "license_invalid", "reason": check.reason })),
        )
            .into_response();
    }

    let token = generate_api_token();
    let token_hash = hash_token(&token);
    let password_hash = match hash_password(&req.dashboard_password) {
        Ok(h) => h,
        Err(e) => {
            tracing::error!("password hashing failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response();
        }
    };

    let result = sqlx::query_as::<_, (Uuid,)>(
        r#"
        INSERT INTO shops (license_key, machine_fingerprint, shop_name, plan, api_token_hash, dashboard_password_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (license_key, machine_fingerprint) DO UPDATE SET
            shop_name = EXCLUDED.shop_name,
            plan = EXCLUDED.plan,
            api_token_hash = EXCLUDED.api_token_hash,
            dashboard_password_hash = EXCLUDED.dashboard_password_hash,
            enabled = true
        RETURNING id
        "#,
    )
    .bind(license_key)
    .bind(&req.machine_fingerprint)
    .bind(&req.shop_name)
    .bind(&check.plan)
    .bind(&token_hash)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok((shop_id,)) => (StatusCode::OK, Json(RegisterResponse { shop_id, api_token: token })).into_response(),
        Err(e) => {
            tracing::error!("register insert failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "internal_error" }))).into_response()
        }
    }
}
