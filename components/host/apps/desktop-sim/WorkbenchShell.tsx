"use client";

/**
 * Workbench chrome — status bar, tool rail, inventory
 * ===================================================
 * The UI that surrounds the build canvas: a dark brushed-metal bench, a status
 * strip across the top, and an iconic tool and inventory panel down the right.
 *
 * ── WHY THE CHROME IS SEPARATE FROM THE CANVAS ──────────────────────────────
 *
 * The canvas owns one coordinate space and nothing else. Putting the tool rail
 * inside that SVG would mean the rail's position depended on the viewBox — so
 * resizing the pane would scale the buttons along with the motherboard, which
 * is exactly the class of coupling that made the earlier renderer unfixable.
 * Chrome is HTML, laid out by flexbox; the bench is SVG, laid out by geometry.
 * They meet only at the store.
 *
 * ── STATUS IS DERIVED ───────────────────────────────────────────────────────
 *
 * The bar reads the same build state the canvas does. It cannot claim
 * "Assembly Complete" while a part is missing, because that string comes from
 * the same `report()` the parts list uses — there is no second source to drift.
 */

import type { ReactNode } from "react";
import { PARTS, isInstalled, type BuildState, type PartId } from "@/lib/desktop-sim/parts";

/** Bench palette — dark brushed metal, amber accents, neon-blue interaction. */
export const BENCH = {
  deck: "#15181d",
  deckHi: "#1e232a",
  panel: "#1a1f26",
  panelHi: "#232932",
  line: "#2c333d",
  text: "#e6ebf2",
  textDim: "#8b96a5",
  accent: "#2f9bff",
  amber: "#f2a33c",
  ok: "#37d399",
  warn: "#f2c94c",
  bad: "#ef5f5f",
} as const;

export type ToolId = "screwdriver" | "paste" | "comb" | "multimeter";

const TOOLS: { id: ToolId; label: string; icon: ReactNode }[] = [
  {
    id: "screwdriver",
    label: "Screwdriver",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="2.5" y="9.5" width="9" height="5" rx="2.5" fill="#e2703a" />
        <rect x="2.5" y="9.5" width="9" height="2" rx="1" fill="#f08a54" />
        <rect x="11.5" y="10.6" width="2" height="2.8" fill="#6b7480" />
        <rect x="13.5" y="11" width="7" height="2" rx="0.6" fill="#c8d0d9" />
        <rect x="20.5" y="10.2" width="2.6" height="3.6" rx="0.5" fill="#98a2ae" />
      </svg>
    ),
  },
  {
    id: "paste",
    label: "Thermal paste",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="3" y="9" width="13" height="6" rx="3" fill="#dfe5ec" />
        <rect x="3" y="9" width="13" height="2.2" rx="1.1" fill="#f4f7fa" />
        <rect x="6" y="10.5" width="7" height="3" rx="1.5" fill="#8b96a5" />
        <rect x="16" y="10.2" width="3" height="3.6" rx="0.6" fill="#98a2ae" />
        <path d="M19 11 L23 12 L19 13 Z" fill="#c8d0d9" />
      </svg>
    ),
  },
  {
    id: "comb",
    label: "Cable comb",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="3" y="7" width="18" height="4" rx="1" fill="#2f9bff" />
        {[5, 9, 13, 17].map((x, i) => (
          <rect key={i} x={x} y="11" width="2.6" height="6" rx="1" fill="#2f9bff" opacity="0.75" />
        ))}
      </svg>
    ),
  },
  {
    id: "multimeter",
    label: "Multimeter",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="4" y="3" width="16" height="18" rx="2.5" fill="#f2a33c" />
        <rect x="6" y="5.5" width="12" height="6" rx="1" fill="#1a1f26" />
        <rect x="7.5" y="7.5" width="6" height="2" rx="0.5" fill="#37d399" />
        <circle cx="12" cy="16" r="3.2" fill="#1a1f26" />
        <rect x="11.4" y="13.6" width="1.2" height="2.6" rx="0.6" fill="#f2a33c" />
      </svg>
    ),
  },
];

/**
 * Top status strip.
 *
 * Reads build state directly, so "Assembly Complete" cannot appear while the
 * parts list still shows something outstanding.
 */
export function StatusBar({
  build,
  complete,
  powered,
}: {
  build: BuildState;
  complete: boolean;
  powered: boolean;
}) {
  const seated = build.installed.length;
  return (
    <div
      className="flex shrink-0 items-center gap-5 border-b px-4 py-2 font-mono text-[10px] tracking-wide"
      style={{ background: BENCH.panel, borderColor: BENCH.line, color: BENCH.textDim }}
    >
      <Stat
        label="BUILD STATUS"
        value={complete ? "Assembly Complete" : `In progress — ${seated}/${PARTS.length} seated`}
        tone={complete ? BENCH.ok : BENCH.warn}
      />
      <Stat label="BIOS VERSION" value="1.23" tone={BENCH.text} />
      <Stat
        label="POWER"
        value={powered ? "On" : "Off"}
        tone={powered ? BENCH.ok : BENCH.textDim}
        dot
      />
      <span className="ml-auto" style={{ color: BENCH.textDim }}>
        ATX MID-TOWER · BENCH 01
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  dot,
}: {
  label: string;
  value: string;
  tone: string;
  dot?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color: BENCH.textDim }}>{label}:</span>
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone, boxShadow: `0 0 6px ${tone}` }}
        />
      )}
      <span style={{ color: tone }}>{value}</span>
    </span>
  );
}

/**
 * Right-hand rail: tools above, inventory below.
 *
 * The inventory shows every part with a status dot rather than hiding seated
 * ones — a builder wants to see the whole bill of materials and what is left,
 * and a list that empties as you work gives no sense of the job's shape.
 */
export function ToolRail({
  build,
  activeTool,
  onTool,
  onPick,
  blockedFor,
}: {
  build: BuildState;
  activeTool: ToolId | null;
  onTool: (t: ToolId | null) => void;
  onPick: (id: PartId) => void;
  blockedFor: (id: PartId) => string | null;
}) {
  return (
    <aside
      className="flex w-56 shrink-0 flex-col border-l"
      style={{ background: BENCH.panel, borderColor: BENCH.line }}
    >
      <div className="border-b px-3 py-2" style={{ borderColor: BENCH.line }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: BENCH.textDim }}>
          Tools
        </h3>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {TOOLS.map((t) => {
            const on = activeTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTool(on ? null : t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={on}
                className="flex aspect-square items-center justify-center rounded-md border transition-all"
                style={{
                  background: on ? BENCH.accent : BENCH.panelHi,
                  borderColor: on ? BENCH.accent : BENCH.line,
                  boxShadow: on ? `0 0 12px -2px ${BENCH.accent}` : undefined,
                }}
              >
                {t.icon}
              </button>
            );
          })}
        </div>
        {activeTool && (
          <p className="mt-2 text-[9px] leading-snug" style={{ color: BENCH.accent }}>
            {activeTool === "screwdriver" && "Click a standoff or bracket screw to drive it."}
            {activeTool === "paste" && "Apply to the CPU die before mounting the cooler."}
            {activeTool === "comb" && "Click a cable run to tidy it into a comb."}
            {activeTool === "multimeter" && "Click a rail to read its voltage."}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto term-scroll px-3 py-2">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: BENCH.textDim }}>
          Inventory
        </h3>
        {PARTS.map((p) => {
          const seated = isInstalled(build, p.id);
          const blocked = blockedFor(p.id);
          const tone = seated ? BENCH.ok : blocked ? BENCH.textDim : BENCH.amber;
          return (
            <button
              key={p.id}
              onClick={() => !seated && !blocked && onPick(p.id)}
              disabled={seated || !!blocked}
              title={blocked ?? undefined}
              className="mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed"
              style={{
                background: BENCH.panelHi,
                borderColor: seated ? `${BENCH.ok}55` : BENCH.line,
                opacity: blocked ? 0.5 : 1,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: tone, boxShadow: seated ? `0 0 6px ${BENCH.ok}` : undefined }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-medium" style={{ color: BENCH.text }}>
                  {p.label}
                </span>
                <span className="block truncate text-[9px]" style={{ color: BENCH.textDim }}>
                  {p.spec}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[8px] uppercase" style={{ color: tone }}>
                {seated ? "seated" : blocked ? "locked" : "ready"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
