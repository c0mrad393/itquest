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
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-edge bg-panelalt px-3.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info/12 text-info">
        <AppIcon id={iconId} size={14} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-semibold text-gray-100">{title}</div>
        {subtitle && <div className="truncate text-[10px] text-gray-500">{subtitle}</div>}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
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
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>
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
              ? "bg-info/20 text-info"
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
          ? "bg-info/20 text-info ring-1 ring-info/40"
          : "text-gray-400 hover:bg-gray-500/10 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
