"use client";

/**
 * The Snap Layouts picker, shown on hover over Maximize.
 *
 * Each option is DRAWN, not labelled. "50/50 split" is a phrase you have to
 * parse; two rectangles side by side is the same information read at a glance,
 * and it is what makes the Windows 11 version usable without a tooltip.
 *
 * The hover target is the parent span, so moving the pointer from the button
 * into the menu never crosses a gap — a menu that closes when you reach for it
 * is worse than no menu.
 *
 * SVG-free: the previews are divs, because they are rectangles.
 */

import type { SnapZone } from "@/lib/host/windows";

/** Each layout as the cells it offers, drawn on a 6x4 grid. */
const LAYOUTS: { id: string; label: string; cells: { zone: SnapZone; style: React.CSSProperties }[] }[] = [
  {
    id: "halves",
    label: "Split in half",
    cells: [
      { zone: "left", style: { gridArea: "1 / 1 / 5 / 4" } },
      { zone: "right", style: { gridArea: "1 / 4 / 5 / 7" } },
    ],
  },
  {
    id: "quads",
    label: "Four quadrants",
    cells: [
      { zone: "tl", style: { gridArea: "1 / 1 / 3 / 4" } },
      { zone: "tr", style: { gridArea: "1 / 4 / 3 / 7" } },
      { zone: "bl", style: { gridArea: "3 / 1 / 5 / 4" } },
      { zone: "br", style: { gridArea: "3 / 4 / 5 / 7" } },
    ],
  },
  {
    id: "thirds",
    label: "Three columns",
    cells: [
      { zone: "third-l", style: { gridArea: "1 / 1 / 5 / 3" } },
      { zone: "third-c", style: { gridArea: "1 / 3 / 5 / 5" } },
      { zone: "third-r", style: { gridArea: "1 / 5 / 5 / 7" } },
    ],
  },
];

export default function SnapMenu({ onPick }: { onPick: (zone: SnapZone) => void }) {
  return (
    <div
      role="menu"
      aria-label="Snap layouts"
      /* `top-full` with no gap: the menu touches the button, so the pointer
         never leaves a hoverable surface on its way down. */
      className="ctx-in absolute right-0 top-full z-[60] w-max rounded-wm border border-edge bg-surface p-2 shadow-panel"
    >
      <div className="mb-1.5 px-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">
        Snap layout
      </div>
      <div className="flex gap-2">
        {LAYOUTS.map((l) => (
          <div
            key={l.id}
            title={l.label}
            className="grid h-11 w-[4.25rem] grid-cols-6 grid-rows-4 gap-[2px] rounded border border-edge bg-surface-2 p-[3px]"
          >
            {l.cells.map((c) => (
              <button
                key={c.zone}
                role="menuitem"
                onClick={() => onPick(c.zone)}
                aria-label={`${l.label}: ${c.zone}`}
                style={c.style}
                className="rounded-[2px] bg-gray-500/25 transition hover:bg-brand-fill"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
