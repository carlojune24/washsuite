import { useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

const TITLES: Record<string, string> = {
  "/settings/printer": "Printer",
  "/settings/backup": "Backup & data",
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Coming soon";

  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-200/50 text-brand-600">
        <Sparkles size={24} strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink/50">This screen isn't built yet — tracked in todo.md.</p>
    </div>
  );
}
