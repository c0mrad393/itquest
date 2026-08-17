"use client";

/**
 * Desktop Hardware Lab — interactive ATX blueprint
 * ================================================
 * A top-down view of an open desktop. Screws, clips, cables and slots are all
 * live: clicking a clip opens it, clicking a screw backs it out, and a part
 * only lifts once the things holding it are actually released.
 *
 * ── THE VIEW OWNS NO RULES ──────────────────────────────────────────────────
 *
 * Every question this component asks — can this come out, what is still holding
 * it, what should be touched next — is answered by `lib/hardware/rig.ts`. It
 * reads slot geometry from the model too, so the board is DATA. Swapping this
 * SVG for a WebGL canvas later means writing a new renderer against the same
 * store, with no rules to port and nothing to keep in sync.
 *
 * ── WHY THE HIGHLIGHT IS DERIVED, NOT SCRIPTED ──────────────────────────────
 *
 * The guidance ring follows `nextAction`, which reads the board's current
 * state. A scripted step list would lose its place the moment a learner did
 * something out of order — undid a screw early, or fixed something the ticket
 * never mentioned — and would then instruct them to do things that were already
 * done. Deriving it means the lab is always pointing at something true.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useState } from "react";
import { useHardwareStore } from "@/lib/hardware/rig-store";
import { blockedReason, canRemove, cablesFor, type Fastener, type Slot } from "@/lib/hardware/rig";
import { AppIcon } from "@/components/ui/app-icons";

/** Board grid → SVG units. The model stores grid units; this is the only scale. */
const U = 26;

const KIND_TONE: Record<string, string> = {
  cpu: "#38bdf8",
  ram: "#a78bfa",
  gpu: "#34d399",
  psu: "#fbbf24",
  storage: "#f472b6",
  fan: "#22d3ee",
};

export default function DesktopHardwareLab() {
  const rig = useHardwareStore((s) => s.rig);
  const selected = useHardwareStore((s) => s.selected);
  const select = useHardwareStore((s) => s.select);
  const toggleClip = useHardwareStore((s) => s.toggleClip);
  const unfastenScrew = useHardwareStore((s) => s.unfastenScrew);
  const connectCable = useHardwareStore((s) => s.connectCable);
  const disconnectCable = useHardwareStore((s) => s.disconnectCable);
  const removeComponent = useHardwareStore((s) => s.removeComponent);
  const insertComponent = useHardwareStore((s) => s.insertComponent);
  const loadScenario = useHardwareStore((s) => s.loadScenario);
  const postResult = useHardwareStore((s) => s.postResult);
  const hint = useHardwareStore((s) => s.hint);

  const [posted, setPosted] = useState<ReturnType<typeof postResult> | null>(null);

  const next = hint();
  const active = rig.slots.find((s) => s.id === selected) ?? null;

  return (
    <div className="theme-dark flex h-full flex-col bg-surface text-gray-100">
      {/* ── Work order ───────────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <span className="text-info-text">
          <AppIcon id="cpu" size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-gray-100">Bench — ATX desktop</div>
          <div className="truncate text-[10px] text-gray-500">
            {next ? next.hint : "Nothing outstanding. Run POST to confirm."}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={useHardwareStore((s) => s.fault)}
            onChange={(e) => {
              const v = e.target.value;
              loadScenario(v === "cpu-fan-unplugged" ? "cpu-fan-unplugged" : v === "none" ? "none" : "faulty-ram");
              setPosted(null);
            }}
            className="rounded border border-edge bg-panel px-2 py-1 text-[10px] text-gray-200"
          >
            <option value="faulty-ram">Scenario — failed RAM stick</option>
            <option value="cpu-fan-unplugged">Scenario — CPU fan unplugged</option>
            <option value="none">Scenario — healthy machine</option>
          </select>
          <button
            onClick={() => setPosted(postResult())}
            className="rounded border border-info bg-info px-2.5 py-1 text-[10px] text-info-on transition-opacity hover:opacity-90"
          >
            Power on (POST)
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Blueprint ──────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-auto term-scroll bg-[#070c14] p-4">
          <svg
            viewBox={`0 0 ${19 * U} ${12 * U}`}
            className="h-auto w-full max-w-[52rem]"
            role="img"
            aria-label="Motherboard blueprint"
          >
            {/* Board substrate + grid */}
            <rect x="0" y="0" width={19 * U} height={12 * U} rx="6" fill="#0b1524" stroke="#1e3a5f" />
            {Array.from({ length: 19 }, (_, i) => (
              <line key={`v${i}`} x1={i * U} y1="0" x2={i * U} y2={12 * U} stroke="#12233a" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i * U} x2={19 * U} y2={i * U} stroke="#12233a" strokeWidth="0.5" />
            ))}

            {/* Cable runs, drawn under the slots so connectors sit on top. */}
            {rig.cables.map((c) => {
              const a = rig.slots.find((s) => s.cableIds.includes(c.id));
              if (!a) return null;
              const x = (a.x + a.w / 2) * U;
              const y = (a.y + a.h / 2) * U;
              return (
                <line
                  key={c.id}
                  x1={x}
                  y1={y}
                  x2={18 * U}
                  y2={11 * U}
                  stroke={c.connected ? "#22d3ee" : "#7f1d1d"}
                  strokeWidth={c.connected ? 1.4 : 1.8}
                  strokeDasharray={c.connected ? undefined : "4 3"}
                  opacity={c.connected ? 0.5 : 0.9}
                />
              );
            })}

            {rig.slots.map((slot) => (
              <SlotShape
                key={slot.id}
                slot={slot}
                selected={selected === slot.id}
                highlighted={next?.slotId === slot.id}
                onSelect={() => select(slot.id)}
                onFastener={(f) =>
                  f.kind === "clip" ? toggleClip(slot.id, f.id) : unfastenScrew(slot.id, f.id)
                }
              />
            ))}
          </svg>

          <p className="mt-3 max-w-[52rem] text-[10px] leading-relaxed text-gray-500">
            Click a slot to inspect it. Filled circles are fastened screws and closed clips — click
            one to release it. A part will not lift until everything holding it is released and its
            cables are clear.
          </p>
        </div>

        {/* ── Inspector ──────────────────────────────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-edge bg-panel">
          <div className="min-h-0 flex-1 overflow-y-auto term-scroll p-3">
            {!active ? (
              <p className="text-[11px] leading-relaxed text-gray-500">
                Select a component on the board to see what is holding it in place.
              </p>
            ) : (
              <Inspector
                slot={active}
                blocked={blockedReason(rig, active.id)}
                removable={canRemove(rig, active.id)}
                cables={cablesFor(rig, active)}
                tray={rig.tray.filter((p) => p.kind === active.kind)}
                onFastener={(f) =>
                  f.kind === "clip" ? toggleClip(active.id, f.id) : unfastenScrew(active.id, f.id)
                }
                onCable={(id, on) => (on ? connectCable(id) : disconnectCable(id))}
                onRemove={() => removeComponent(active.id)}
                onInsert={(partId) => insertComponent(active.id, partId)}
              />
            )}
          </div>

          {posted && (
            <div className="shrink-0 border-t border-edge p-3">
              <div className={`text-[11px] font-semibold ${posted.boots ? "text-ok-text" : "text-danger-text"}`}>
                {posted.boots ? "POST passed — machine boots" : "POST failed"}
              </div>
              <ul className="mt-1 space-y-0.5">
                {posted.faults.map((f) => (
                  <li key={f} className="text-[10px] leading-snug text-gray-400">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Blueprint pieces ────────────────────────────────────────────────────────

function SlotShape({
  slot,
  selected,
  highlighted,
  onSelect,
  onFastener,
}: {
  slot: Slot;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onFastener: (f: Fastener) => void;
}) {
  const tone = KIND_TONE[slot.kind] ?? "#94a3b8";
  const filled = !!slot.part;

  return (
    <g>
      {/* Guidance ring — derived from the board, see the header note. */}
      {highlighted && (
        <rect
          x={slot.x * U - 4}
          y={slot.y * U - 4}
          width={slot.w * U + 8}
          height={slot.h * U + 8}
          rx="5"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.6"
          strokeDasharray="5 3"
        />
      )}

      <rect
        onClick={onSelect}
        x={slot.x * U}
        y={slot.y * U}
        width={slot.w * U}
        height={slot.h * U}
        rx="3"
        fill={filled ? `${tone}22` : "#0e1a2b"}
        stroke={selected ? "#e2e8f0" : filled ? tone : "#334155"}
        strokeWidth={selected ? 1.8 : 1.1}
        strokeDasharray={filled ? undefined : "3 2"}
        className="cursor-pointer"
      />

      <text
        x={slot.x * U + 4}
        y={slot.y * U + 11}
        fontSize="7.5"
        fill={filled ? tone : "#64748b"}
        className="pointer-events-none select-none font-mono"
      >
        {slot.label}
      </text>
      {slot.part && (
        <text
          x={slot.x * U + 4}
          y={slot.y * U + 20}
          fontSize="6.5"
          fill="#94a3b8"
          className="pointer-events-none select-none"
        >
          {slot.part.model}
        </text>
      )}
      {slot.part?.faulty && (
        <text
          x={slot.x * U + 4}
          y={slot.y * U + 29}
          fontSize="6.5"
          fill="#f87171"
          className="pointer-events-none select-none"
        >
          self-test failed
        </text>
      )}

      {/*
       * Fasteners sit ON the slot edge, spaced along it, because that is where
       * they are on real hardware — a clip at the end of a DIMM slot, screws at
       * the corners of a cooler. Placing them arbitrarily would make the
       * blueprint decorative rather than instructive.
       */}
      {slot.fasteners.map((f, i) => {
        const along = slot.fasteners.length === 1 ? 0.5 : i / (slot.fasteners.length - 1);
        const vertical = slot.h > slot.w;
        const cx = vertical ? (slot.x + slot.w / 2) * U : (slot.x + 0.15 * slot.w + along * 0.7 * slot.w) * U;
        const cy = vertical ? (slot.y + 0.1 * slot.h + along * 0.8 * slot.h) * U : (slot.y + slot.h) * U;
        return (
          <g key={f.id} onClick={() => onFastener(f)} className="cursor-pointer">
            <circle cx={cx} cy={cy} r="6" fill="transparent" />
            <circle
              cx={cx}
              cy={cy}
              r="3.4"
              fill={f.fastened ? tone : "none"}
              stroke={f.fastened ? tone : "#64748b"}
              strokeWidth="1.2"
              strokeDasharray={f.fastened ? undefined : "2 1.5"}
            />
            {f.fastened && f.kind === "screw" && (
              <line
                x1={cx - 2}
                y1={cy}
                x2={cx + 2}
                y2={cy}
                stroke="#0b1524"
                strokeWidth="1"
                className="pointer-events-none"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Inspector({
  slot,
  blocked,
  removable,
  cables,
  tray,
  onFastener,
  onCable,
  onRemove,
  onInsert,
}: {
  slot: Slot;
  blocked: string | null;
  removable: boolean;
  cables: ReturnType<typeof cablesFor>;
  tray: { id: string; model: string }[];
  onFastener: (f: Fastener) => void;
  onCable: (id: string, on: boolean) => void;
  onRemove: () => void;
  onInsert: (partId: string) => void;
}) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-gray-100">{slot.label}</h3>
      <p className="mt-0.5 text-[10px] text-gray-500">
        {slot.part ? slot.part.model : "empty"}
        {slot.part?.faulty && <span className="ml-1 text-danger-text">· failed self-test</span>}
      </p>

      {slot.fasteners.length > 0 && (
        <section className="mt-3">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Fasteners
          </h4>
          {slot.fasteners.map((f) => (
            <button
              key={f.id}
              onClick={() => onFastener(f)}
              className="mb-1 flex w-full items-center gap-2 rounded border border-edge px-2 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-500/10"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${f.fastened ? "bg-warn" : "bg-ok"}`}
              />
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              <span className="shrink-0 text-[9px] text-gray-500">
                {f.fastened ? (f.kind === "clip" ? "closed" : "driven") : "released"}
              </span>
            </button>
          ))}
        </section>
      )}

      {cables.length > 0 && (
        <section className="mt-3">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Cables
          </h4>
          {cables.map((c) => (
            <button
              key={c.id}
              onClick={() => onCable(c.id, !c.connected)}
              className="mb-1 flex w-full items-center gap-2 rounded border border-edge px-2 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-500/10"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${c.connected ? "bg-ok" : "bg-danger"}`} />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="shrink-0 text-[9px] text-gray-500">
                {c.connected ? "connected" : "unplugged"}
              </span>
            </button>
          ))}
        </section>
      )}

      <section className="mt-3 border-t border-edge pt-3">
        {slot.part ? (
          <>
            <button
              onClick={onRemove}
              disabled={!removable}
              className="w-full rounded border border-edge px-2 py-1.5 text-[11px] text-gray-200 transition-colors hover:bg-gray-500/10 disabled:opacity-40"
            >
              Remove {slot.part.model}
            </button>
            {/* The reason, not just a disabled control — the model supplies it. */}
            {blocked && <p className="mt-1.5 text-[10px] leading-relaxed text-warn-text">{blocked}</p>}
          </>
        ) : tray.length ? (
          <>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              On the bench
            </h4>
            {tray.map((p) => (
              <button
                key={p.id}
                onClick={() => onInsert(p.id)}
                className="mb-1 w-full rounded border border-edge px-2 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-500/10"
              >
                Fit {p.model}
              </button>
            ))}
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-gray-500">
            Slot is empty and there is no matching part on the bench.
          </p>
        )}
      </section>
    </div>
  );
}
