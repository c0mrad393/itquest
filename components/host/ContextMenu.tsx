"use client";

/**
 * ITQuest — Context menu surface
 * ==============================
 * Renders whatever the context-menu store currently describes. Mounted once,
 * at the desktop root, above everything.
 *
 * It knows nothing about desktops, taskbars or apps — it renders entries and
 * calls their `onSelect`. Every surface that wants a menu describes one.
 *
 * ── DISMISSAL ───────────────────────────────────────────────────────────────
 *
 * Any outside LEFT-click closes it, and so does Escape, a scroll, a resize, or
 * a second right-click elsewhere. The listeners are attached only while the
 * menu is open — a global mousedown listener that lives forever is a listener
 * that fires on every click in the product for the 99% of time no menu exists.
 *
 * `mousedown` rather than `click`, because the menu should be gone before the
 * thing underneath reacts; waiting for `click` leaves it hanging over the
 * result of the action that dismissed it.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useRef } from "react";
import {
  MENU_W,
  isSeparator,
  useContextMenuStore,
} from "@/lib/host/context-menu";

export default function ContextMenu() {
  const open = useContextMenuStore((s) => s.open);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const entries = useContextMenuStore((s) => s.entries);
  const closeMenu = useContextMenuStore((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      // A right-click elsewhere will open its own menu; let that happen rather
      // than closing here and leaving the new one to fight this one's teardown.
      if (e.button === 2) return;
      if (ref.current?.contains(e.target as Node)) return;
      closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeMenu);
    // Capture phase: a scroll inside any panel should dismiss, and scroll does
    // not bubble from a scrolling container.
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [open, closeMenu]);

  // Focus the menu so Escape works without the operator clicking it first.
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open, x, y]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label="Context menu"
      // The transform origin follows the anchor so the open animation grows
      // out of the cursor rather than out of an arbitrary corner.
      className="ctx-in fixed z-[10200] select-none overflow-hidden rounded-wm border border-edge bg-surface/95 py-1 shadow-panel outline-none backdrop-blur-xl"
      style={{ left: x, top: y, width: MENU_W }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry) =>
        isSeparator(entry) ? (
          <div key={entry.id} role="separator" className="my-1 h-px bg-edge" />
        ) : (
          <button
            key={entry.id}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              // Close FIRST: an action that opens a window should not have the
              // menu still painted over the window it just opened.
              closeMenu();
              entry.onSelect?.();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              entry.danger
                ? "text-danger-strong hover:bg-danger/15"
                : "text-gray-200 hover:bg-brand-soft/15 hover:text-gray-50"
            }`}
          >
            <span className="flex w-4 shrink-0 items-center justify-center text-gray-400">
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.hint && (
              <span className="shrink-0 text-[10px] tabular-nums text-gray-500">{entry.hint}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
