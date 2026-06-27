"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { AopStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Light, minimal UI primitives with a deliberate type scale.
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeading({
  children,
  description,
  right,
}: {
  children: React.ReactNode;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="t-card-heading">{children}</h3>
        {description && <p className="t-caption mt-0.5">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="t-display">{title}</h1>
        {description && <p className="t-body mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="t-title">{title}</h2>
        {subtitle && <p className="t-caption mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
    ghost: "text-gray-600 hover:bg-gray-100",
    outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-10 px-4 text-sm",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "slate",
  icon,
  ariaLabel,
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "indigo" | "blue";
  icon?: React.ReactNode;
  ariaLabel?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-gray-100 text-gray-600 ring-gray-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
  };
  return (
    <span
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  note,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  /** Plain-English, one-line explanation shown under the input. */
  note?: string;
  error?: string;
  /** Marks the field mandatory: shows a red * and is targeted by scroll-to-error. */
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block scroll-mt-28" data-field-error={error ? "true" : undefined}>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="t-label">
          {label}
          {required && <span className="ml-0.5 font-semibold text-rose-500" aria-hidden>*</span>}
        </span>
        {hint && <span className="t-caption">{hint}</span>}
      </span>
      <div className={error ? "rounded-lg ring-2 ring-rose-400/60" : ""}>{children}</div>
      {note && <span className="mt-1 block text-[11.5px] leading-snug text-gray-400">{note}</span>}
      {error && <span className="mt-1 block text-[12px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

/** Small read-only tile for auto-calculated values with an explanation of the math. */
export function AutoStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-1.5">
        <span className="t-overline">{label}</span>
        <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-600">
          Auto
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-gray-900">{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{note}</div>}
    </div>
  );
}

// Important: `text-base` (16px) prevents iOS Safari from zooming on focus.
// We restore the smaller visual `text-sm` on sm+ screens where zoom isn't an issue.
const inputBase =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm";

export function NumberInput({
  value,
  onChange,
  invalid = false,
  ...props
}: {
  value: number;
  onChange: (v: number) => void;
  invalid?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`${inputBase} ${invalid ? "border-rose-400 ring-2 ring-rose-300/50" : ""}`}
      // Blank (NaN) renders as an empty box; clearing the box reports NaN so the
      // field reads as "not filled" for mandatory validation.
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      {...props}
      placeholder={(props.placeholder as string) ?? "Enter value"}
    />
  );
}

export function TextInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputBase} min-h-[84px] resize-y`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputBase} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "red" | "default";
  tip?: string;
}) {
  const valueTone =
    tone === "green"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-rose-600"
          : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
      <div className="t-overline">{label}{tip && <InfoTip text={tip} />}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${valueTone}`}>{value}</div>
      {sub && <div className="t-caption mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Prominent KPI card for header metric grids (Last-Year actuals, Schools-in-area).
 * Bigger than `Stat`, with an optional accent tint and a "frozen" lock chip for
 * read-only snapshot values.
 */
/** Small "i" info icon with a hover/tap tooltip, portal-rendered so it escapes
 *  overflow-hidden cards and is never clipped. */
export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; placement: "top" | "bottom" }>({ top: 0, left: 0, placement: "top" });
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const W = 240, M = 8;
  const open = () => {
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const placement = r.top < 150 ? "bottom" : "top";
      const left = Math.min(Math.max(r.left + r.width / 2, W / 2 + M), window.innerWidth - W / 2 - M);
      setPos({ top: placement === "top" ? r.top - M : r.bottom + M, left, placement });
    }
    setShow(true);
  };
  return (
    <span className="inline-block align-middle">
      <button
        ref={btnRef}
        type="button"
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold leading-none text-gray-500 transition-colors hover:bg-indigo-100 hover:text-indigo-600"
        onMouseEnter={open}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.preventDefault(); show ? setShow(false) : open(); }}
        aria-label={text}
      >
        i
      </button>
      {show && typeof document !== "undefined" && createPortal(
        <span
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: `translate(-50%, ${pos.placement === "top" ? "-100%" : "0"})` }}
          className="pointer-events-none z-[1000] block w-60 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-gray-700 shadow-xl"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  accent = "indigo",
  frozen = false,
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "indigo" | "emerald" | "sky" | "amber" | "violet" | "slate" | "rose";
  frozen?: boolean;
  tip?: string;
}) {
  const accents: Record<string, string> = {
    indigo: "from-indigo-50",
    emerald: "from-emerald-50",
    sky: "from-sky-50",
    amber: "from-amber-50",
    violet: "from-violet-50",
    slate: "from-gray-50",
    rose: "from-rose-50",
  };
  const dots: Record<string, string> = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    slate: "bg-gray-400",
    rose: "bg-rose-500",
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b ${accents[accent]} to-white p-3.5`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dots[accent]}`} aria-hidden />
        <span className="t-overline">{label}</span>
        {tip && <InfoTip text={tip} />}
        {frozen && (
          <span className="ml-auto rounded bg-white/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400 ring-1 ring-inset ring-gray-200">
            🔒 Live
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-7 tracking-tight text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="t-caption mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Segmented "switch view" toggle — rounded track with a white active pill
 * (matches the header nav style). Use for view switchers and small filters.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50/70 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`min-h-[30px] rounded-lg px-3.5 text-[13px] font-medium transition-all ${
            value === o.key
              ? "bg-white text-indigo-700 shadow-sm ring-1 ring-inset ring-gray-200"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Inline spinner for buttons and loading overlays. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em] ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * Searchable multi-select. Trigger + popover with a search box and checkbox list,
 * plus removable chips for the current selection. Smooth, keyboard-friendly.
 */
export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No options",
  disabled = false,
  loading = false,
  labelFor,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Display label for an option value (value stays clean, label can add e.g. counts). */
  labelFor?: (value: string) => string;
}) {
  const label = (o: string) => (labelFor ? labelFor(o) : o);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? options.filter((o) => label(o).toLowerCase().includes(needle) || o.toLowerCase().includes(needle))
      : options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, q, labelFor]);

  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <span className="truncate">
          {selected.length ? `${selected.length} selected` : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <span className="ml-2 shrink-0 text-gray-400">{loading ? "…" : open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {loading && <div className="px-3 py-2 text-[13px] text-gray-500">Loading…</div>}
            {!loading && filtered.length === 0 && <div className="px-3 py-2 text-[13px] text-gray-500">{emptyText}</div>}
            {filtered.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-indigo-50">
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-700">{label(o)}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-3 py-1.5">
            <span className="text-[11px] text-gray-400">{selected.length} selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onChange([])} className="text-[12px] font-medium text-gray-500 hover:text-gray-700">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-medium text-indigo-600 hover:underline">Done</button>
            </div>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-2 pr-1 text-[12px] text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {label(s)}
              {!disabled && (
                <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s}`} className="grid h-4 w-4 place-items-center rounded-full text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700">×</button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ pct, tone = "indigo" }: { pct: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const colors: Record<string, string> = {
    indigo: "bg-indigo-600",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full ${colors[tone] ?? colors.indigo}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon = "✦",
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div
        aria-hidden
        className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-white text-2xl text-indigo-500 ring-1 ring-inset ring-indigo-100"
      >
        {icon}
      </div>
      <h3 className="t-card-heading">{title}</h3>
      {description && <p className="t-caption mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-gray-200 bg-gray-50 px-1.5 text-[10.5px] font-semibold text-gray-600 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  );
}

/**
 * Lightweight CSS-based confetti burst.
 * Renders one full-screen overlay with N short-lived squares that fall + rotate.
 * No external dep, auto-unmounts when `play` flips false.
 */
export function ConfettiBurst({ play }: { play: boolean }) {
  if (!play) return null;
  const colors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#0EA5E9", "#A855F7"];
  const pieces = Array.from({ length: 80 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const duration = 1.6 + Math.random() * 1.4;
    const size = 6 + Math.round(Math.random() * 6);
    const rot = Math.round(Math.random() * 360);
    const color = colors[i % colors.length];
    return (
      <span
        key={i}
        aria-hidden
        className="confetti-piece"
        style={{
          left: `${left}%`,
          width: size,
          height: size * 0.6,
          background: color,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          transform: `rotate(${rot}deg)`,
        }}
      />
    );
  });
  return <div className="confetti-overlay" aria-hidden>{pieces}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full ${maxWidth} my-auto`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="t-title">{title}</h2>
              {description && <p className="t-caption mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AOP status — single source of truth for tone, icon, label, aria-label.
// ---------------------------------------------------------------------------

type StatusTone = "slate" | "amber" | "blue" | "green" | "red" | "indigo";

export const aopStatusMeta: Record<
  AopStatus,
  { tone: StatusTone; icon: string; label: string; aria: string }
> = {
  not_started: { tone: "slate", icon: "○", label: "Not started", aria: "Status: not started" },
  draft: { tone: "amber", icon: "◐", label: "Draft", aria: "Status: draft in progress" },
  submitted: { tone: "blue", icon: "▲", label: "Submitted", aria: "Status: submitted, awaiting review" },
  in_review: { tone: "blue", icon: "◆", label: "In review", aria: "Status: in review" },
  changes_requested: { tone: "amber", icon: "⟳", label: "Changes requested", aria: "Status: changes requested" },
  approved: { tone: "green", icon: "✓", label: "Approved", aria: "Status: approved" },
  rejected: { tone: "red", icon: "✕", label: "Rejected", aria: "Status: rejected" },
};

export function StatusPill({ status }: { status: AopStatus }) {
  const m = aopStatusMeta[status];
  return (
    <Badge tone={m.tone} icon={m.icon} ariaLabel={m.aria}>
      {m.label}
    </Badge>
  );
}
