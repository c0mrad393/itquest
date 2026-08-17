"use client";

/**
 * The snap preview.
 *
 * A translucent outline of where the window will land, drawn while a drag is
 * armed over an edge or corner. Windows shows one, and without it the snap is
 * a surprise — the operator releases expecting a drop and gets a resize.
 *
 * `pointer-events-none` is load-bearing: this element sits under the cursor by
 * definition, and anything it intercepted would be intercepted from the very
 * gesture that is drawing it.
 */

import type { WindowRect } from "@/lib/host/windows";

export default function SnapGhost({ rect }: { rect: WindowRect }) {
  return (
    <div
      aria-hidden="true"
      className="snap-ghost pointer-events-none fixed z-[45] rounded-wm border-2 border-brand-fill/70 bg-brand-soft/20 backdrop-blur-[1px]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  );
}
