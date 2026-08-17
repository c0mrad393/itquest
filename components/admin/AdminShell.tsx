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
 */

import { useEffect } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { useAdminUi } from "@/lib/admin/ui";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const hydrate = useAdminUi((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

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
