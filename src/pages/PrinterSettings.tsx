import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Printer, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  ENCODE,
  PAPER_SIZE_CHARS_PER_LINE,
  test_thermal_printer,
  type PaperSize,
  type PrinterInfo,
} from "tauri-plugin-thermal-printer";
import {
  getStoredPaperSize,
  getStoredPrinterId,
  listPairedPrinters,
  resolvePrinterTarget,
  resolveSelectedPrinter,
  setStoredPaperSize,
  setStoredPrinterId,
} from "../lib/printer";

const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  Mm40: "40mm",
  Mm44: "44mm",
  Mm58: "58mm",
  Mm72: "72mm",
  Mm80: "80mm",
  Mm104: "104mm",
};
const PAPER_SIZE_ORDER: PaperSize[] = ["Mm40", "Mm44", "Mm58", "Mm72", "Mm80", "Mm104"];

export default function PrinterSettings() {
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>(getStoredPaperSize);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(getStoredPrinterId);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    refreshPrinters();
  }, []);

  async function refreshPrinters() {
    setLoadingPrinters(true);
    setPrinterError(null);
    try {
      const found = await listPairedPrinters();
      setPrinters(found);
      setSelectedPrinterId(resolveSelectedPrinter(found)?.identifier ?? null);
    } catch (err) {
      setPrinterError(String(err));
      setPrinters(null);
    } finally {
      setLoadingPrinters(false);
    }
  }

  function handleSelectSize(size: PaperSize) {
    setPaperSize(size);
    setStoredPaperSize(size);
    toast.success(`Roll width set to ${PAPER_SIZE_LABELS[size]}`);
  }

  function handleSelectPrinter(p: PrinterInfo) {
    setStoredPrinterId(p.identifier);
    setSelectedPrinterId(p.identifier);
    toast.success(`${p.name || p.identifier} set as default printer`);
  }

  async function handleTestPrint() {
    const printer = printers?.find((p) => p.identifier === selectedPrinterId);
    if (!printer) {
      toast.error(
        printers && printers.length > 1
          ? "Select a printer above first."
          : "No paired printer found. Pair one in your device's Bluetooth settings.",
      );
      return;
    }
    setTesting(true);
    try {
      await test_thermal_printer({
        printer_info: {
          printer: resolvePrinterTarget(printer),
          paper_size: paperSize,
          options: { code_page: 6, encode: ENCODE.WINDOWS_1252, use_gbk: false },
          sections: [],
        },
        include_text: true,
        include_text_styles: false,
        include_alignment: true,
        include_columns: true,
        include_separators: true,
        include_barcode: false,
        include_qr: false,
        include_beep: true,
        cut_paper: true,
        test_feed: true,
      });
      toast.success("Test print sent");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setTesting(false);
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
        <h1 className="text-xl font-semibold text-ink">Printer</h1>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
            <Printer size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Paired printer</p>
            <p className="text-xs text-ink/50">
              Pair your receipt printer in the device's Bluetooth settings first — WashSuite only sees printers
              already paired at the OS level.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshPrinters}
            disabled={loadingPrinters}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-ink/60"
          >
            <RefreshCw size={14} strokeWidth={2.2} className={loadingPrinters ? "animate-spin" : ""} />
          </button>
        </div>

        {printerError && <p className="text-sm text-red-600">{printerError}</p>}
        {!printerError && !loadingPrinters && (!printers || printers.length === 0) && (
          <p className="text-sm text-ink/50">No paired printer found.</p>
        )}
        {printers && printers.length > 0 && (
          <ul className="space-y-1.5">
            {printers.map((p) => {
              const selected = p.identifier === selectedPrinterId;
              return (
                <li key={p.identifier}>
                  <button
                    type="button"
                    onClick={() => handleSelectPrinter(p)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                      selected ? "bg-brand-500 text-white" : "bg-page text-ink"
                    }`}
                  >
                    <span className="font-medium">{p.name || p.identifier}</span>
                    <span className={`flex items-center gap-1.5 text-xs ${selected ? "text-white/80" : "text-ink/40"}`}>
                      {p.status}
                      {selected && <CheckCircle2 size={14} strokeWidth={2.2} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {printers && printers.length > 1 && !selectedPrinterId && (
          <p className="mt-2 text-xs text-amber-600">Multiple paired devices found — tap one above to select it.</p>
        )}
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-ink">Roll width</p>
        <p className="mb-3 text-xs text-ink/50">
          Match this to the paper actually loaded in the printer so receipts don't print too narrow or get cut off.
        </p>
        <div className="space-y-1.5">
          {PAPER_SIZE_ORDER.map((size) => {
            const selected = size === paperSize;
            return (
              <button
                key={size}
                type="button"
                onClick={() => handleSelectSize(size)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                  selected ? "bg-brand-500 text-white" : "bg-page text-ink"
                }`}
              >
                <span className="font-medium">{PAPER_SIZE_LABELS[size]}</span>
                <span className={`flex items-center gap-1.5 text-xs ${selected ? "text-white/80" : "text-ink/40"}`}>
                  {PAPER_SIZE_CHARS_PER_LINE[size]} chars/line
                  {selected && <CheckCircle2 size={14} strokeWidth={2.2} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-ink">Test print</p>
        <p className="mb-3 text-xs text-ink/50">
          Sends a short test page at the roll width selected above so you can confirm it fits before printing a real
          receipt.
        </p>
        <button
          type="button"
          onClick={handleTestPrint}
          disabled={testing || loadingPrinters}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {testing ? "Printing…" : "Send test print"}
        </button>
      </div>
    </div>
  );
}
