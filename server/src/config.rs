/// Loaded once at startup from environment variables (see deploy/washsuite-monitor.env.example).
pub struct Config {
    pub database_url: String,
    /// The same Supabase validate-license edge function the Tauri app itself calls
    /// (src-tauri/src/license.rs) -- this server re-validates every registration
    /// server-to-server instead of trusting the client's self-reported license state.
    pub supabase_validate_url: String,
    /// Used to derive the HMAC key that signs dashboard session cookies. Any length is fine --
    /// it's stretched to 64 bytes via SHA-512 in main.rs, so a short secret can't panic
    /// `cookie::Key::from` at startup.
    pub session_secret: String,
    pub bind_addr: String,
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            supabase_validate_url: std::env::var("SUPABASE_VALIDATE_URL").unwrap_or_else(|_| {
                "https://hxgjduszmszydrkvdesf.supabase.co/functions/v1/validate-license".to_string()
            }),
            session_secret: std::env::var("SESSION_SECRET").expect("SESSION_SECRET must be set"),
            bind_addr: std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8090".to_string()),
        }
    }
}
