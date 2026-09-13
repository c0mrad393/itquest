"use client";

/**
 * AppChrome — shared furniture for the Level-0 host apps.
 *
 * Every app used to draw its own header, chips and tab strip slightly
 * differently, which read as a set of separate tools rather than one OS. These
 * primitives fix the vertical rhythm (36px header, 32px filter bar), the type
 * scale, and the control shapes so the apps feel like siblings.
 */

import type { HostAppIconId } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import { IconSearch } from "@/components/ui/icons";

/** Title bar inside an app body: icon, name, live counters, right-aligned tools. */
export function AppHeader({
  iconId,
  title,
  subtitle,
  children,
}: {
  iconId: HostAppIconId;
  title: string;
  subtitle?: string;
  /** Right-aligned controls (search, toggles, actions). */
  children?: React.ReactNode;
}) {
  /*
   * NARROW WINDOWS USED TO CRUSH THIS.
   *
   * The title block could shrink and the controls could not be told apart from
   * it, so at around 600 pixels flex took the space out of BOTH: the name
   * collapsed to "Ticke…", the subtitle to "Incident…", and the count pill was
   * squeezed until its text wrapped inside a rounded-full chip and rendered as
   * a circle sitting on top of the truncated title.
   *
   * Three changes, all intrinsic — no breakpoint, because a breakpoint would
   * be answering a question about the browser window rather than this one:
   *
   *   the controls never shrink, and scroll instead if there is truly no room;
   *   the title block is the only thing that gives way, and truncates cleanly;
   *   the subtitle is dropped first, being the least load-bearing thing here.
   */
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-edge bg-panelalt px-3.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-info/12 text-info">
        <AppIcon id={iconId} size={14} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold text-gray-100">{title}</div>
        {subtitle && <div className="truncate text-[10px] text-gray-500">{subtitle}</div>}
      </div>
      <div className="scroll-thin flex shrink-0 items-center gap-2 overflow-x-auto">{children}</div>
    </div>
  );
}

/** Count pill used beside a header title (open tickets, unread mail, …). */
export function CountPill({
  value,
  label,
  tone = "info",
}: {
  value: number | string;
  label?: string;
  tone?: "info" | "warn" | "muted";
}) {
  const tones = {
    info: "bg-info/15 text-info",
    warn: "bg-amber-500/15 text-amber-300",
    muted: "bg-gray-500/10 text-gray-400",
  } as const;
  return (
    // `shrink-0` and `whitespace-nowrap`: without them the label wraps inside
    // the pill and a "6 open" chip renders as a circle with the text hidden.
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
    >
      {value}
      {label ? ` ${label}` : ""}
    </span>
  );
}

/** Compact search field with a leading glyph. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = "w-56",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-600">
        <IconSearch size={12} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-edge bg-panel py-1.5 pl-7 pr-2 text-[11px] text-gray-200 outline-none transition placeholder:text-gray-600 focus:border-info"
      />
    </label>
  );
}

/**
 * Segmented control — one connected group, unlike loose pill chips. Used for
 * short mutually-exclusive filters (severity, tabs) so they read as one control
 * and stop wrapping onto a second row.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-edge bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded px-2 py-1 text-[10px] font-medium transition ${
            value === o.value
              ? "bg-info/20 text-info-strong"
              : "text-gray-400 hover:bg-gray-500/10 hover:text-gray-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter bar: a scrollable row of chips on the left, fixed controls on the right. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-edge px-3.5">{children}</div>
  );
}

/*
 * `-strong` rather than the base ink on the ACTIVE state.
 *
 * `text-info` on `bg-info/20` measured 4.40:1 in light mode — a miss of a
 * tenth, on the one chip in each group that says where you are. The `-strong`
 * token exists precisely for ink sitting on its own family's tint, and it is
 * the difference between 4.40 and comfortably over AA in both themes.
 */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
        active
          ? "bg-info/20 text-info-strong ring-1 ring-info/40"
          : "text-gray-400 hover:bg-gray-500/10 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
