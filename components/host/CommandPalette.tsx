"use client";

/**
 * Command palette (v0.9.1)
 * ========================
 * Cmd/Ctrl+K over apps, open tickets and a few direct actions.
 *
 * WHY A POWER-USER FEATURE BELONGS IN AN ACCESSIBILITY RELEASE. The rest of
 * v0.9.x slows the interface down for newcomers — fewer things on screen, more
 * clicks to reach an app, more explanation per square inch. Every one of those
 * changes taxes the operator who already knows where everything is. The
 * palette is the counterweight: it makes the experienced player FASTER than
 * they were before the declutter, so the beginner-friendly defaults cost them
 * nothing. A simplification that only serves beginners eventually gets
 * reverted by the people who use the product most.
 *
 * WHAT IS IN IT. Apps, because the drawer is now two clicks away. Open
 * tickets, because "find the ticket about the file server" is the single most
 * repeated navigation in the game. Actions, because switching theme or opening
 * DevTools mid-triage should not require aiming at the taskbar.
 *
 * THE TYPING RULE. Shortcuts must not fire while the operator is typing —
 * Cmd+K inside a ticket reply, or worse, inside a nested terminal where the
 * keystroke belongs to the simulated shell. `isTypingTarget` gates every
 * global binding on that, and Escape is deliberately NOT globally bound for
 * the same reason: nested surfaces own it.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useThemeStore } from "@/lib/host/theme";
import { visibleApps, HOST_APP_GROUPS, type HostAppId } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import { IconSearch, IconTicket, IconCommand, IconContrast } from "@/components/ui/icons";
import { useOperatorLevel } from "@/lib/progression/use-standing";

/**
 * True when the keystroke belongs to whatever the operator is typing into.
 * Exported because the ticket shortcut below and any future global binding
 * must ask the same question — one definition, so they cannot disagree.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
}

type Row =
  | { kind: "app"; id: HostAppId; title: string; sub: string; iconId: string }
  | { kind: "ticket"; id: string; title: string; sub: string }
  | { kind: "action"; id: string; title: string; sub: string; run: () => void };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openApp = useHostStore((s) => s.openApp);
  const level = useOperatorLevel();
  const tickets = useTicketStore((s) => s.tickets);
  const select = useTicketStore((s) => s.select);
  const cycleTheme = useThemeStore((s) => s.cycle);

  // ── Global bindings ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "k") {
        // The one shortcut that fires even in a field: it is how you LEAVE a
        // field, and every other product with a palette behaves this way.
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (key === "n") {
        // Cmd+N: jump to the next ticket still needing work. Not "the next
        // one in the list" — an operator asking for the next ticket wants the
        // next one they can DO something about.
        e.preventDefault();
        const pending = useTicketStore
          .getState()
          .tickets.filter((t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed");
        if (!pending.length) return;
        const currentId = useTicketStore.getState().selectedId;
        const at = pending.findIndex((t) => t.id === currentId);
        const next = pending[(at + 1) % pending.length];
        select(next.id);
        openApp("itsm");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, openApp]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => field.current?.focus());
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const apps = visibleApps(level);
    const groupLabel = (g: string) =>
      HOST_APP_GROUPS.find((x) => x.id === g)?.label ?? "Applications";

    const appRows: Row[] = apps.map((a) => ({
      kind: "app",
      id: a.id,
      title: a.title,
      sub: groupLabel(a.group),
      iconId: a.iconId,
    }));

    const ticketRows: Row[] = tickets
      .filter((t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed")
      .slice(0, 40)
      .map((t) => ({
        kind: "ticket",
        id: t.id,
        title: t.title,
        sub: `${t.code} · ${t.severity} · ${t.category}`,
      }));

    const actionRows: Row[] = [
      {
        kind: "action",
        id: "theme",
        title: "Switch theme",
        sub: "Light, dark, or follow the system",
        run: cycleTheme,
      },
    ];

    const q = query.trim().toLowerCase();
    const all = [...appRows, ...ticketRows, ...actionRows];
    if (!q) return all;
    return all.filter(
      (r) => r.title.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q),
    );
  }, [level, tickets, query, cycleTheme]);

  useEffect(() => {
    if (cursor >= rows.length) setCursor(0);
  }, [rows.length, cursor]);

  if (!open) return null;

  function run(row: Row) {
    if (row.kind === "app") openApp(row.id);
    if (row.kind === "ticket") {
      select(row.id);
      openApp("itsm");
    }
    if (row.kind === "action") row.run();
    setOpen(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-[290] bg-sunken/60" onClick={() => setOpen(false)} />

      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed left-1/2 top-[12vh] z-[300] flex max-h-[64vh] w-[36rem] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-panel"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3.5 py-2.5">
          <IconSearch size={14} className="shrink-0 text-gray-500" />
          <input
            ref={field}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter" && rows[cursor]) { e.preventDefault(); run(rows[cursor]); }
            }}
            placeholder="Search apps, tickets and actions…"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
          />
          <kbd className="shrink-0 rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] text-gray-500">esc</kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-gray-500">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {rows.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => run(r)}
              onMouseMove={() => setCursor(i)}
              data-selected={i === cursor}
              ref={(el) => { if (i === cursor && el) el.scrollIntoView({ block: "nearest" }); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition data-[selected=true]:bg-brand-soft/15"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-3 text-gray-300">
                {r.kind === "app" ? (
                  <AppIcon id={r.iconId as never} size={14} />
                ) : r.kind === "ticket" ? (
                  <IconTicket size={13} />
                ) : (
                  <IconContrast size={13} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-gray-100">{r.title}</span>
                <span className="block truncate text-[11px] text-gray-500">{r.sub}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600">
                {r.kind}
              </span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-edge bg-surface-2 px-3.5 py-2 text-[10px] text-gray-500">
          <IconCommand size={11} />
          <Hint keys="↑ ↓" label="navigate" />
          <Hint keys="enter" label="open" />
          <Hint keys="⌘K" label="palette" />
          <Hint keys="⌘N" label="next ticket" />
        </div>
      </div>
    </>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-edge px-1 py-px font-mono text-[9px] text-gray-400">{keys}</kbd>
      {label}
    </span>
  );
}
