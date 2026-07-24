import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { closeDb } from "../lib/db";

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function Backup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const bytes = await invoke<number[]>("export_database");
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `washsuite-backup-${todayStamp()}.db`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup exported");
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  }

  async function handlePickFile() {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "WashSuite Backup", extensions: ["db"] }],
    });
    if (!path || Array.isArray(path)) return;

    toast("Restore from this backup?", {
      description: "This replaces ALL current data on this device with the backup's data. This can't be undone.",
      action: { label: "Restore", onClick: () => handleImport(path) },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 10000,
    });
  }

  async function handleImport(path: string) {
    setImporting(true);
    setError(null);
    try {
      const bytes = await readFile(path);
      // Must close the connection before overwriting the file on disk -- otherwise the
      // still-open connection's own WAL/cache keeps the old data alive underneath the new
      // file and can write it straight back out, silently undoing the restore.
      await closeDb();
      await invoke("import_database", { bytes: Array.from(bytes) });
      toast.success("Backup restored", {
        description: "Close and reopen WashSuite for the restored data to take effect.",
        duration: 10000,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Backup & data</h1>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
            <Download size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Export backup</p>
            <p className="text-xs text-ink/50">
              Save a full copy of everything — orders, customers, inventory, payroll — as a single file.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {exporting ? "Exporting…" : "Export backup"}
        </button>
      </div>

      <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <Upload size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Restore from backup</p>
            <p className="text-xs text-ink/50">Replaces everything currently on this device with a previously exported backup.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePickFile}
          disabled={importing}
          className="w-full rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 disabled:opacity-60"
        >
          {importing ? "Restoring…" : "Choose backup file"}
        </button>
      </div>
    </div>
  );
}
