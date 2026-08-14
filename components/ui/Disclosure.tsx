"use client";

/**
 * Progressive disclosure (v0.9.1)
 * ===============================
 * An "Advanced settings" section that starts closed.
 *
 * WHAT DECIDES WHAT GOES INSIDE, because getting this wrong makes the pattern
 * actively harmful: a field belongs in the advanced section only if leaving it
 * alone produces a CORRECT result. Anything the operator must supply, and
 * anything whose default is merely a guess, stays visible. Hiding a required
 * field behind a toggle does not reduce cognitive load — it converts a visible
 * decision into an invisible failure, and the beginner this was supposed to
 * help is the one least able to work out why their submission was rejected.
 *
 * The summary line reports what is currently inside ("3 settings, all default")
 * so a closed section is never a black box. An operator should be able to skip
 * it with confidence, not with hope.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@/components/ui/icons";

export default function Disclosure({
  label = "Advanced settings",
  summary,
  defaultOpen = false,
  children,
}: {
  label?: string;
  /** What is inside, in a few words. Shown while collapsed. */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="rounded-md border border-edge bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-gray-500/10"
      >
        <IconChevronDown
          size={13}
          className={`shrink-0 text-gray-500 transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[11px] font-medium text-gray-200">{label}</span>
        {summary && !open && (
          <span className="min-w-0 truncate text-[10px] text-gray-500">{summary}</span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-gray-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div id={id} className="space-y-3 border-t border-edge px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
