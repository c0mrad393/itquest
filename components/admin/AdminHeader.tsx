"use client";

/**
 * ITQuest Admin — top bar
 * =======================
 * Collapse toggle, breadcrumbs, global search, notifications, profile.
 *
 * The breadcrumbs and the page title both resolve from `lib/admin/nav.ts`, so
 * renaming a section renames it everywhere at once. The search and the bell
 * are Phase 1 shells: they open, they are keyboard-reachable, and they say
 * plainly that the index behind them is not wired yet rather than swallowing a
 * query and returning nothing.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { crumbsForPath, sectionForPath } from "@/lib/admin/nav";
import { useAdminUi } from "@/lib/admin/ui";
import { ACTIVITY_FEED, relativeTime } from "@/lib/admin/mock-data";
import { IconSearch, IconChevronDown, IconAlert } from "@/components/ui/icons";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function AdminHeader() {
  const pathname = usePathname();
  const toggle = useAdminUi((s) => s.toggle);
  const collapsed = useAdminUi((s) => s.collapsed);
  const crumbs = crumbsForPath(pathname);
  const section = sectionForPath(pathname);

  const [open, setOpen] = useState<"bell" | "profile" | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // One outside-click listener for both popovers, attached only while one is
  // open — a permanent global listener fires on every click in the panel for
  // the majority of the time nothing is open.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (shellRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const alerts = ACTIVITY_FEED.filter((e) => e.severity).slice(0, 4);

  return (
    <header
      ref={shellRef}
      className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-surface px-4"
    >
      <button
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-surface-2 hover:text-gray-100"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-[12px]">
          {crumbs.map((c, i) => (
            <li key={c.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-gray-600">
                  /
                </span>
              )}
              {c.href ? (
                <Link href={c.href} className="text-gray-500 transition hover:text-gray-200">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-gray-100">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Search. Sized generously because it is the control an admin reaches
          for most in a tool like this, even while it is a shell. */}
      <div className="ml-auto hidden min-w-0 max-w-sm flex-1 md:block">
        <label className="relative block">
          <span className="sr-only">Search users, scenarios and tickets</span>
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500">
            <IconSearch size={13} />
          </span>
          <input
            placeholder="Search users, scenarios, tickets…"
            className="w-full rounded-md border border-edge bg-surface-2 py-1.5 pl-8 pr-3 text-[12px] text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-brand-text focus:ring-2 focus:ring-brand-text/25"
          />
        </label>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
        {/*
          The shell's note says this panel follows the reader's light/dark
          preference rather than forcing one, which is the right call for
          something read for an hour at a time. It was only half true: the
          preference could be set from the simulator's taskbar and nowhere
          else, so an administrator who never opens the desktop had no
          preference to follow and no way to make one.
        */}
        <ThemeToggle />

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => (o === "bell" ? null : "bell"))}
            aria-label={`Notifications (${alerts.length} needing attention)`}
            aria-expanded={open === "bell"}
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-surface-2 hover:text-gray-100"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
              <path d="M10.5 20a2 2 0 003 0" />
            </svg>
            {alerts.length > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-danger" />
            )}
          </button>
          {open === "bell" && (
            <Popover>
              <PopoverHead>Needs attention</PopoverHead>
              {alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-3 py-2">
                  <IconAlert
                    size={12}
                    className={`mt-0.5 shrink-0 ${a.severity === "critical" ? "text-danger-strong" : "text-warn-strong"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] text-gray-200">{a.actor}</div>
                    <div className="text-[11px] leading-snug text-gray-500">{a.summary}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-600">{relativeTime(a.at)}</span>
                </div>
              ))}
              <PopoverNote>Sourced from mock data. Nothing here is live yet.</PopoverNote>
            </Popover>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => (o === "profile" ? null : "profile"))}
            aria-expanded={open === "profile"}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-surface-2"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-fill text-[10px] font-bold text-brand-on">
              OP
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-[12px] font-medium leading-tight text-gray-100">Operator</span>
              <span className="block text-[10px] leading-tight text-gray-500">Platform admin</span>
            </span>
            <IconChevronDown size={12} className="shrink-0 text-gray-500" />
          </button>
          {open === "profile" && (
            <Popover>
              <PopoverHead>ops@itquest.example</PopoverHead>
              {["Account settings", "Audit log", "Sign out"].map((label) => (
                <button
                  key={label}
                  disabled
                  className="flex w-full cursor-not-allowed items-center px-3 py-2 text-left text-[12px] text-gray-500"
                >
                  {label}
                </button>
              ))}
              <PopoverNote>Phase 1 — these actions are not wired up.</PopoverNote>
            </Popover>
          )}
        </div>
      </div>

      {/* The section blurb lives on the page, not here; the header stays one
          row tall so the content area starts at a predictable offset. */}
      <span className="sr-only">{section.blurb}</span>
    </header>
  );
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="ctx-in absolute right-0 top-[calc(100%+0.4rem)] w-72 overflow-hidden rounded-md border border-edge bg-surface shadow-panel">
      {children}
    </div>
  );
}

function PopoverHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-edge bg-surface-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </div>
  );
}

function PopoverNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-edge px-3 py-1.5 text-[10px] leading-relaxed text-gray-600">
      {children}
    </div>
  );
}
