use tauri::Manager;

/// The literal 16-byte header every valid SQLite database file starts with -- used to reject an
/// obviously-wrong file before it overwrites the real database.
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";

fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // Matches exactly what tauri-plugin-sql resolves "sqlite:washsuite.db" against.
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("couldn't resolve app config directory: {e}"))?;
    Ok(dir.join("washsuite.db"))
}

/// Reads the live database file's raw bytes, for the frontend to trigger a download of (via the
/// same blob-download path already used for PDF exports -- see DownloadPlugin.kt on Android /
/// on_download in lib.rs on desktop).
#[tauri::command]
pub fn export_database(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let path = db_path(&app)?;
    std::fs::read(&path).map_err(|e| format!("couldn't read database file: {e}"))
}

/// Replaces the live database file with the given bytes. The caller is expected to have already
/// confirmed this with the user -- it's a full, unconditional overwrite. Takes effect on the next
/// app launch; the connection already open in this session keeps using its old in-memory state
/// until then, so the frontend should tell the user to restart.
#[tauri::command]
pub fn import_database(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    if !bytes.starts_with(SQLITE_HEADER) {
        return Err("That doesn't look like a WashSuite backup file.".into());
    }

    let path = db_path(&app)?;
    std::fs::write(&path, &bytes).map_err(|e| format!("couldn't write database file: {e}"))?;

    // Stale WAL/SHM sidecar files from the *old* database would otherwise shadow the restored
    // data the next time it's opened; removing them is safe since we just wrote a complete,
    // self-contained replacement of the main file.
    let _ = std::fs::remove_file(path.with_extension("db-wal"));
    let _ = std::fs::remove_file(path.with_extension("db-shm"));

    Ok(())
}
