"use client";

/**
 * App Drawer (v0.9.0) — replaces the Start menu and the floating desktop icons
 * ===========================================================================
 * The desktop used to carry every unlocked app as a loose icon: fifteen tiles
 * of undifferentiated text down the left edge, present from the first second
 * of a new game. It was the single biggest source of "where do I even start".
 *
 * WHAT CHANGED, AND WHY THAT ORDER:
 *
 *   1. THE DESKTOP IS NOW EMPTY. Not decoration — an empty desktop is what
 *      makes the one open window read as "this is the thing to do".
 *   2. APPS LIVE HERE, GROUPED BY JOB. "Support & Tickets", "Infrastructure",
 *      "Knowledge", "System". By job rather than by subsystem, because a
 *      newcomer does not know whether the ticket queue counts as ITSM or as
 *      productivity — they know they are here to answer requests.
 *   3. SEARCH FIRST. Once an operator knows the estate, typing three letters
 *      beats reading four headings, and the field is focused on open.
 *
 * Progressive disclosure is doing real work here: at level 1 only five apps
 * exist, so the drawer opens showing a short, legible list rather than a wall
 * the player has to learn to ignore.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import {
  HOST_APP_GROUPS,
  visibleApps,
  type HostAppDescriptor,
  type HostAppGroup,
} from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import Avatar from "./Avatar";
import { IconSearch } from "@/components/ui/icons";
import { useOperatorLevel } from "@/lib/progression/use-standing";

export default function AppDrawer() {
  const open = useHostStore((s) => s.startMenuOpen);
  const toggle = useHostStore((s) => s.toggleStartMenu);
  const setOpen = useHostStore((s) => s.setStartMenu);
  const openApp = useHostStore((s) => s.openApp);
  const host = useHostStore((s) => s.host);
  const level = useOperatorLevel();
  const [query, setQuery] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      // A drawer that opens ready to type is one keystroke from any app.
      requestAnimationFrame(() => field.current?.focus());
    }
  }, [open]);

  const apps = useMemo(() => visibleApps(level), [level]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (a: HostAppDescriptor) =>
      !q || a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    const out: { group: (typeof HOST_APP_GROUPS)[number]; apps: HostAppDescriptor[] }[] = [];
    for (const group of HOST_APP_GROUPS) {
      const inGroup = apps.filter((a) => a.group === group.id && matches(a));
      if (inGroup.length) out.push({ group, apps: inGroup });
    }
    return out;
  }, [apps, query]);

  if (!open) return null;

  const total = grouped.reduce((n, g) => n + g.apps.length, 0);

  function launch(id: HostAppDescriptor["id"]) {
    openApp(id);
    // Close by ASSIGNMENT, not by toggle. `openApp` already closes the menu, so
    // a toggle here flipped it straight back open behind the launched window.
    setOpen(false);
  }

  return (
    <>
      {/* Click-away. A drawer you cannot dismiss by looking away is a modal. */}
      <div className="fixed inset-0 z-[190]" onClick={toggle} />

      <div
        role="dialog"
        aria-label="Applications"
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-14 left-1/2 z-[200] flex max-h-[70vh] w-[34rem] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-panel"
      >
        {/* Search */}
        <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3.5 py-2.5">
          <IconSearch size={14} className="shrink-0 text-gray-500" />
          <input
            ref={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") toggle();
              if (e.key === "Enter" && grouped[0]?.apps[0]) launch(grouped[0].apps[0].id);
            }}
            placeholder="Search applications…"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
          />
          <kbd className="shrink-0 rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
            esc
          </kbd>
        </div>

        {/* Groups */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {total === 0 && (
            <p className="px-2 py-8 text-center text-sm text-gray-500">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}

          {grouped.map(({ group, apps: inGroup }) => (
            <section key={group.id} className="mb-1">
              <div className="flex items-baseline gap-2 px-2 pb-1 pt-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.label}
                </h3>
                <span className="text-[11px] text-gray-600">{group.blurb}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {inGroup.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => launch(a.id)}
                    title={a.description}
                    className="group flex items-start gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-info/10 focus-visible:bg-info/10"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gray-300 transition group-hover:bg-info/20 group-hover:text-info">
                      <AppIcon id={a.iconId} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-100">{a.title}</span>
                      <span className="line-clamp-2 block text-[11px] leading-snug text-gray-500">
                        {a.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Operator footer */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-edge bg-surface-2 px-3.5 py-2.5">
          <Avatar value={host.user.avatar} name={host.user.displayName} className="h-7 w-7" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-gray-100">
              {host.user.displayName}
            </span>
            <span className="block truncate text-[11px] text-gray-500">
              {host.user.role} · level {level}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-gray-500">
            {host.user.budget.toLocaleString()} Cr
          </span>
        </div>
      </div>
    </>
  );
}
