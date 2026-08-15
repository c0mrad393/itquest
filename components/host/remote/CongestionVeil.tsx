"use client";

/**
 * Congestion veil — what a saturated link FEELS like (Build 3)
 * ============================================================
 * A remote session over a congested network is not a session with a bad number
 * in the corner. It is a session where the window stops repainting, your
 * keystrokes arrive in a clump, and you find yourself clicking the same button
 * twice because nothing appeared to happen. Reporting "latency: 340ms" and
 * leaving the UI perfectly smooth would teach the opposite of the lesson: that
 * congestion is a statistic rather than something users ring up about.
 *
 * ── WHAT THIS DOES, AND THE LINE IT DOES NOT CROSS ──────────────────────────
 *
 * It makes the session STUTTER — periodic frozen frames with a buffering
 * indicator, proportional to how far over capacity the path is.
 *
 * It does NOT swallow input. Blocking clicks would be more "realistic" and
 * would make the simulator hostile: a player trying to FIX the congestion has
 * to work through this surface to do it, and a UI that eats the click on
 * "disable port" is punishing them for the thing they are being asked to
 * learn. Frames freeze; the controls underneath stay live the whole time.
 *
 * That asymmetry is deliberate and worth keeping. The feeling of lag comes
 * from the visual stall, which is exactly where real RDP lag is felt.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useState, type ReactNode } from "react";
import { SATURATION_PENALTY, type SaturationLevel } from "@/lib/core";
import { IconActivity } from "@/components/ui/icons";

/** How often a stall happens, by level. Nothing at all below congested. */
const STALL_EVERY_MS: Partial<Record<SaturationLevel, number>> = {
  congested: 5200,
  saturated: 2600,
};

export default function CongestionVeil({
  level,
  hostname,
  children,
}: {
  level: SaturationLevel;
  hostname: string;
  children: ReactNode;
}) {
  const [stalled, setStalled] = useState(false);
  const period = STALL_EVERY_MS[level];
  const holdMs = SATURATION_PENALTY[level].frameDelayMs;

  useEffect(() => {
    if (!period || !holdMs) {
      setStalled(false);
      return;
    }
    let release: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setStalled(true);
      release = setTimeout(() => setStalled(false), holdMs);
    }, period);
    return () => {
      clearInterval(id);
      if (release) clearTimeout(release);
    };
  }, [period, holdMs]);

  if (!period) return <>{children}</>;

  return (
    <div className="relative h-full">
      {/*
        The frozen frame. `filter` and `opacity` only — NOT `pointer-events`,
        so every control underneath stays clickable while the picture stalls.
        This is the whole design decision of this component.
      */}
      <div
        className="h-full transition-[filter,opacity] duration-150"
        style={
          stalled
            ? { filter: "blur(1.4px) saturate(0.72)", opacity: 0.82 }
            : undefined
        }
      >
        {children}
      </div>

      {stalled && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border border-remote-edge bg-remote-bar px-3 py-2 text-remote-bar-fg shadow-panel">
            <IconActivity size={13} className="animate-pulse" />
            <span className="text-[11px] font-medium">Reconnecting to {hostname}…</span>
          </div>
        </div>
      )}

      {/* A persistent marker, so the operator knows the stalling is the network
          rather than the machine even between freezes. */}
      <div className="pointer-events-none absolute right-2 top-2 z-20">
        <span
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
            level === "saturated"
              ? "bg-danger text-white"
              : "bg-warn text-white"
          }`}
        >
          <IconActivity size={9} />
          {level === "saturated" ? "Link saturated" : "Link congested"}
        </span>
      </div>
    </div>
  );
}
