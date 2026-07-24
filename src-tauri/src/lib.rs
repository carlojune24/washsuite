use tauri_plugin_sql::{Migration, MigrationKind};

mod backup;
mod license;

/// Database migrations, applied in order the first time each is seen.
/// Add new migrations by appending to this Vec -- never edit a migration
/// that has already shipped, add a new one instead (0002_..., 0003_..., etc).
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "customer_landmark",
            sql: include_str!("../migrations/0002_customer_landmark.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "customer_redeemed_points",
            sql: include_str!("../migrations/0003_customer_redeemed_points.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "inventory_item_management",
            sql: include_str!("../migrations/0004_inventory_item_management.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "inventory_purchases",
            sql: include_str!("../migrations/0005_inventory_purchases.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "movement_unit_price",
            sql: include_str!("../migrations/0006_movement_unit_price.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "fifo_costing",
            sql: include_str!("../migrations/0007_fifo_costing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "service_packages",
            sql: include_str!("../migrations/0008_service_packages.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "package_items_inventory",
            sql: include_str!("../migrations/0009_package_items_inventory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "order_details",
            sql: include_str!("../migrations/0010_order_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "package_services",
            sql: include_str!("../migrations/0011_package_services.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "movement_order_link",
            sql: include_str!("../migrations/0012_movement_order_link.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "expense_receipt_image",
            sql: include_str!("../migrations/0013_expense_receipt_image.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "attendance_overtime",
            sql: include_str!("../migrations/0014_attendance_overtime.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "attendance_undertime",
            sql: include_str!("../migrations/0015_attendance_undertime.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "cash_advances",
            sql: include_str!("../migrations/0016_cash_advances.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "attendance_notes",
            sql: include_str!("../migrations/0017_attendance_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "deductions",
            sql: include_str!("../migrations/0018_deductions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "cashflow_method",
            sql: include_str!("../migrations/0019_cashflow_method.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "loyalty",
            sql: include_str!("../migrations/0020_loyalty.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "loyalty_redemption",
            sql: include_str!("../migrations/0021_loyalty_redemption.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "payroll",
            sql: include_str!("../migrations/0022_payroll.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "role_permissions",
            sql: include_str!("../migrations/0023_role_permissions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "license_state",
            sql: include_str!("../migrations/0024_license_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "dose_pricing",
            sql: include_str!("../migrations/0025_dose_pricing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "item_dose_size",
            sql: include_str!("../migrations/0026_item_dose_size.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "item_dose_unit",
            sql: include_str!("../migrations/0027_item_dose_unit.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "invoice_settings",
            sql: include_str!("../migrations/0028_invoice_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "license_state_expiry",
            sql: include_str!("../migrations/0029_license_state_expiry.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Android has no equivalent of desktop wry's `on_download` -- this bridges to a native
/// DownloadListener (see gen/android/.../DownloadPlugin.kt) that saves exported files (jsPDF's
/// `doc.save()`, e.g. payslips/DTRs/Cashflow reports) to the device's Downloads folder. A no-op
/// everywhere else, since desktop's `on_download` in `run()` below already covers that case.
fn download_handler_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("download-handler")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin("com.washsuite.app", "DownloadPlugin")?;
            }
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:washsuite.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_thermal_printer::init())
        .plugin(download_handler_plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            license::get_machine_fingerprint,
            license::check_license,
            license::release_license,
            backup::export_database,
            backup::import_database
        ])
        .setup(|app| {
            // tauri.conf.json declares no windows (`"windows": []`), so on EVERY platform the
            // "main" window only ever exists because it's built here -- there's no fallback.
            // Desktop additionally needs `on_download` attached: WebView2 silently drops every
            // download (e.g. jsPDF's `doc.save()`, used by the Cashflow PDF export) unless the
            // host app explicitly opts in -- with no handler registered at all, Tauri never even
            // asks WebView2 to allow it. Sizing/centering/title are desktop-only chrome that
            // don't apply to mobile's single fullscreen webview.
            #[cfg(desktop)]
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("WashSuite")
                .inner_size(820.0, 1000.0)
                .center()
                .on_download(|_webview, _event| true)
                .build()?;
            #[cfg(mobile)]
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default()).build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
