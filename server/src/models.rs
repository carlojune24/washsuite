use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub license_key: String,
    pub machine_fingerprint: String,
    pub shop_name: Option<String>,
    pub dashboard_password: String,
    pub app_version: String,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub shop_id: Uuid,
    pub api_token: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub shop_id: Uuid,
    pub password: String,
}

#[derive(Serialize)]
pub struct DashboardSnapshotResponse {
    pub shop_name: Option<String>,
    pub received_at: Option<DateTime<Utc>>,
    pub snapshot_date: Option<NaiveDate>,
    pub snapshot: Option<Value>,
}

#[derive(Deserialize)]
pub struct SnapshotQuery {
    pub date: Option<String>,
}
