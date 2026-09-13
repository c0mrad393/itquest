"use client";

/**
 * ITQuest Admin — shell
 * =====================
 * Sidebar, header, scrolling content column.
 *
 * ── DELIBERATELY NOT THE OS SHELL ───────────────────────────────────────────
 *
 * No windows, no taskbar, no desktop store, no tutorial director. This is a
 * conventional admin layout that happens to live in the same repository, and
 * the only thing it shares with the simulator is the DESIGN TOKENS — surfaces,
 * edges, brand, the type scale. Sharing tokens means a skin change reaches
 * both; sharing components would mean the panel inherits window management it
 * has no use for.
 *
 * Because it uses the token layer rather than hardcoded colours, it follows
 * the operator's light/dark preference and any active skin for free. That
 * matters more here than on the marketing page: this is a tool someone reads
 * for an hour at a time, and forcing a theme on them would be a worse call
 * than it was on the landing page.
 *
 * The header carries the control that makes that preference expressible here
 * rather than only inside the simulator, and this shell subscribes to the OS
 * so "system" keeps meaning system after the page has loaded.
 */

import * as React from "react";
import { useEffect } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { useAdminUi } from "@/lib/admin/ui";
import { useThemeStore } from "@/lib/host/theme";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const hydrate = useAdminUi((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  /*
   * The boot script stamps the right class before paint, so this panel was
   * never WRONG at load. But `init` is what subscribes to the OS, and it was
   * only ever called by HostDesktop — so an administrator whose machine went
   * dark at sunset sat in a light panel until they reloaded.
   */
  const initTheme = useThemeStore((s) => s.init);
  useEffect(() => initTheme(), [initTheme]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-sunken text-gray-200">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="min-h-0 flex-1 overflow-y-auto term-scroll">{children}</main>
      </div>
    </div>
  );
}

/**
 * The standard page frame: title, blurb, actions, body.
 *
 * Exported here so every admin page gets the same vertical rhythm without
 * copying a header block. Pages that lay their own heading out drift by a few
 * pixels each, and an enterprise tool reads as cheap the moment its section
 * titles do not line up between pages.
 */
export function AdminPage({
  title,
  blurb,
  actions,
  children,
}: {
  title: string;
  blurb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold tracking-tight text-gray-50">{title}</h1>
          {blurb && <p className="mt-0.5 text-[12.5px] text-gray-500">{blurb}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * The mock-data banner.
 *
 * On every page, on purpose. An admin panel that shows plausible user counts
 * and server health without saying where they came from is a panel someone
 * will eventually make a decision on. It costs one row to prevent that, and it
 * comes out in one place when the API lands.
 */
export function MockBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn/[0.07] px-3 py-2">
      <span aria-hidden="true" className="mt-0.5 text-warn-strong">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
      </span>
      <p className="text-[11.5px] leading-relaxed text-warn-strong">
        <span className="font-semibold">Phase 1 — mock data.</span>{" "}
        <span className="text-gray-400">
          Every figure on this page comes from <span className="font-mono">lib/admin/mock-data.ts</span>. Nothing
          is read from a backend and no control here changes real state.
        </span>
      </p>
    </div>
  );
}

/** A panel with an optional header row. The one container used everywhere. */
export function Card({
  title,
  subtitle,
  actions,
  bodyClassName = "p-4",
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-edge bg-surface ${className}`}>
      {title && (
        <div className="flex items-center gap-3 border-b border-edge bg-surface-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[12.5px] font-semibold text-gray-100">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-gray-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ── Shared table furniture ──────────────────────────────────────────────────

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-accent/15 text-accent-strong",
  warn: "bg-warn/15 text-warn-strong",
  bad: "bg-danger/15 text-danger-strong",
  info: "bg-info/15 text-info",
  neutral: "bg-gray-500/15 text-gray-400",
};

/** A status chip. One shape for every state word in the panel. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

/** A search box and a row of filter groups above a table. */
export function Toolbar({
  query,
  onQuery,
  placeholder = "Search…",
  children,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-2 px-3 py-2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-7 min-w-[12rem] flex-1 rounded border border-edge bg-surface px-2 text-[12px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-info/50"
      />
      {children}
    </div>
  );
}

/** One exclusive filter group — "all" plus the values it can take. */
export function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "all";
  options: readonly T[];
  onChange: (v: T | "all") => void;
}) {
  const all: (T | "all")[] = ["all", ...options];
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {all.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded px-1.5 py-0.5 text-[11px] capitalize transition ${
            value === o ? "bg-info/15 text-info" : "text-gray-500 hover:bg-panelalt hover:text-gray-300"
          }`}
        >
          {o === "all" ? label : o.replace(/-/g, " ")}
        </button>
      ))}
    </div>
  );
}

/**
 * The honest action log.
 *
 * Phase 1 has no backend, so a control that visually "worked" would be lying.
 * Every action appends a line saying what was requested and that the call was
 * not sent — and the same panel is where real responses will land, so the
 * plumbing does not have to be invented later.
 *
 * Shared rather than re-implemented per page: four screens writing their own
 * slightly different "not sent" wording is four chances to accidentally write
 * one that sounds like it succeeded.
 */
export function useActionLog(limit = 12) {
  const [lines, setLines] = React.useState<string[]>([]);
  const record = React.useCallback(
    (line: string) =>
      setLines((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, limit)),
    [limit],
  );
  /** For anything that would change data. Always states that it did not. */
  const recordCall = React.useCallback(
    (line: string) => record(`${line} · not sent (no backend in Phase 1)`),
    [record],
  );
  return { lines, record, recordCall };
}

export function ActionLog({ lines }: { lines: string[] }) {
  return (
    <Card title="Action log" subtitle="What this panel would have sent" bodyClassName="p-0">
      {lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-[11.5px] text-gray-600">
          Nothing yet. Actions you take appear here with what they would have called.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto term-scroll divide-y divide-edge/60">
          {lines.map((l, i) => (
            <li key={i} className="px-3 py-1.5 font-mono text-[10.5px] leading-relaxed text-gray-400">
              {l}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A two-line figure for the small stat strips above a table. */
export function Stat({ label, value, tone = "neutral" }: { label: string; value: React.ReactNode; tone?: Tone }) {
  const colour =
    tone === "bad" ? "text-danger-strong" : tone === "warn" ? "text-warn-strong" : tone === "ok" ? "text-accent-strong" : "text-gray-100";
  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2.5">
      <div className={`text-[17px] font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}
