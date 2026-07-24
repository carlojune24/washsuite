import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";

interface ListRowProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  iconClassName?: string;
  title: string;
  titleClassName?: string;
  subtitle?: ReactNode;
  subtitleClassName?: string;
  value?: ReactNode;
  valueClassName?: string;
  to?: string;
}

export default function ListRow({
  icon: Icon,
  iconClassName,
  title,
  titleClassName,
  subtitle,
  subtitleClassName,
  value,
  valueClassName,
  to,
}: ListRowProps) {
  const content = (
    <>
      <span
        className={
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
          (iconClassName ?? "bg-brand-200/50 text-brand-600")
        }
      >
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={"truncate text-sm font-semibold " + (titleClassName ?? "text-ink")}>{title}</p>
        {subtitle && (
          <p className={"truncate text-xs " + (subtitleClassName ?? "text-ink/50")}>{subtitle}</p>
        )}
      </div>
      {value !== undefined && (
        <span className={"shrink-0 text-sm font-semibold " + (valueClassName ?? "text-ink")}>{value}</span>
      )}
    </>
  );

  if (to) {
    return (
      <li className="rounded-2xl bg-surface shadow-sm">
        <Link to={to} className="flex items-center gap-3 p-3.5">
          {content}
        </Link>
      </li>
    );
  }

  return <li className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">{content}</li>;
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-ink/40">{text}</p>;
}

export function PageHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {hint && <p className="mt-0.5 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}
