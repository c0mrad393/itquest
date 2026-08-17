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
import { blockedReason, canRemove, cablesFor, type Fastener, type MachineKind, type Slot } from "@/lib/hardware/rig";
import { useInfraStore } from "@/lib/infra/store";
import { AppIcon } from "@/components/ui/app-icons";
import { BiosSetupScreen, OsInstallScreen, PostHaltScreen, RunningScreen } from "./BiosScreen";
import {
  BOARD,
  BOARD_SIZE,
  BoardSubstrate,
  ChassisFurniture,
  CableRun,
  FastenerVisual,
  PartPortrait,
  SlotBody,
  type BoardKind,
} from "./RigVisuals";

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

  const phase = useHardwareStore((s) => s.phase);
  const machine = useHardwareStore((s) => s.machine);
  /*
   * Read here, NOT inline in the JSX below.
   *
   * The firmware phases early-return above, so any hook called further down the
   * tree runs on some renders and not others — React counts hooks positionally
   * and throws "rendered fewer hooks than expected" the first time you press
   * power. Every hook this component needs must be called before the first
   * early return, unconditionally.
   */
  const fault = useHardwareStore((s) => s.fault);
  const powerOn = useHardwareStore((s) => s.powerOn);
  const commissionNode = useInfraStore((s) => s.commissionBenchMachine);
  const [registered, setRegistered] = useState<string | null>(null);

  const next = hint();
  const active = rig.slots.find((s) => s.id === selected) ?? null;

  /*
   * Firmware phases take over the whole surface, exactly as they do on a real
   * machine: once you press power there is no bench to look at, only what the
   * box is showing you. Routing here rather than inside the blueprint keeps the
   * bench a bench.
   */
  if (phase === "post-halt") return <PostHaltScreen />;
  if (phase === "bios") return <BiosSetupScreen />;
  if (phase === "installing") {
    return (
      <OsInstallScreen
        onCommit={(spec) => setRegistered(commissionNode({ machine, ...spec }))}
      />
    );
  }
  if (phase === "running") return <RunningScreen hostname={registered} />;

  return (
    <div className="theme-dark flex h-full flex-col bg-surface text-gray-100">
      {/* ── Work order ───────────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <span className="text-info-text">
          <AppIcon id="cpu" size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-gray-100">Bench — {machine === "laptop" ? "laptop" : machine === "server" ? "2U server" : "ATX desktop"}</div>
          <div className="truncate text-[10px] text-gray-500">
            {next ? next.hint : "Nothing outstanding. Run POST to confirm."}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={fault}
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
          <select
            value={machine}
            onChange={(e) => {
              const v = e.target.value;
              const kind: MachineKind = v === "laptop" ? "laptop" : v === "server" ? "server" : "desktop";
              loadScenario(fault, kind);
              setPosted(null);
              setRegistered(null);
            }}
            className="rounded border border-edge bg-panel px-2 py-1 text-[10px] text-gray-200"
          >
            <option value="desktop">ATX desktop</option>
            <option value="laptop">Laptop</option>
            <option value="server">2U server</option>
          </select>
          <button
            onClick={() => setPosted(postResult())}
            className="rounded border border-edge px-2.5 py-1 text-[10px] text-gray-200 transition-colors hover:bg-gray-500/10"
          >
            Dry-run POST
          </button>
          <button
            onClick={powerOn}
            className="rounded border border-info bg-info px-2.5 py-1 text-[10px] text-info-on transition-opacity hover:opacity-90"
          >
            Power button
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Blueprint ──────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-auto term-scroll bg-[#070c14] p-4">
          <svg
            viewBox={`0 0 ${BOARD_SIZE[machine].w * U} ${BOARD_SIZE[machine].h * U}`}
            className="h-auto w-full max-w-[52rem]"
            role="img"
            aria-label="Motherboard blueprint"
          >
            <BoardSubstrate kind={machine} w={BOARD_SIZE[machine].w * U} h={BOARD_SIZE[machine].h * U} />
            <ChassisFurniture kind={machine} u={U} />

            {/* Cables run under the components, as they do on a real board. */}
            {rig.cables.map((c) => {
              const a = rig.slots.find((sl) => sl.cableIds.includes(c.id));
              if (!a) return null;
              return (
                <CableRun
                  key={c.id}
                  kind={c.kind}
                  connected={c.connected}
                  from={{ x: (a.x + a.w / 2) * U, y: (a.y + a.h / 2) * U }}
                  to={{ x: (BOARD_SIZE[machine].w - 1.4) * U, y: (BOARD_SIZE[machine].h - 0.8) * U }}
                />
              );
            })}

            {rig.slots.map((slot) => (
              <SlotShape
                key={slot.id}
                slot={slot}
                board={machine}
                selected={selected === slot.id}
                highlighted={next?.slotId === slot.id}
                onSelect={() => select(slot.id)}
                onFastener={(f) =>
                  f.kind === "clip" || f.kind === "zif" || f.kind === "handle"
                    ? toggleClip(slot.id, f.id)
                    : unfastenScrew(slot.id, f.id)
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
                board={machine}
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

/**
 * One slot on the board.
 *
 * The body is drawn by `RigVisuals` — this component's only jobs are placing
 * it, labelling it, and putting the fasteners where they physically sit. Which
 * means adding a new part type is a change in one file, not two.
 */
function SlotShape({
  slot,
  board,
  selected,
  highlighted,
  onSelect,
  onFastener,
}: {
  slot: Slot;
  board: BoardKind;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onFastener: (f: Fastener) => void;
}) {
  const g = { x: slot.x * U, y: slot.y * U, w: slot.w * U, h: slot.h * U };
  const vertical = slot.h > slot.w;
  const silk = BOARD[board].silk;

  return (
    <g>
      {/* Guidance ring — still derived from `nextAction`, just prettier. */}
      {highlighted && (
        <rect
          x={g.x - 5}
          y={g.y - 5}
          width={g.w + 10}
          height={g.h + 10}
          rx="4"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.8"
          strokeDasharray="6 4"
          opacity="0.95"
        />
      )}

      {/* Silkscreen outline + designator, printed on the board under the part. */}
      <rect
        x={g.x - 2.5}
        y={g.y - 2.5}
        width={g.w + 5}
        height={g.h + 5}
        rx="2"
        fill="none"
        stroke={silk}
        strokeWidth="0.7"
        opacity="0.32"
      />
      <text
        x={g.x - 2}
        y={g.y - 4.5}
        fontSize="6.5"
        fill={silk}
        opacity="0.65"
        className="pointer-events-none select-none font-mono"
      >
        {slot.label}
      </text>

      {/*
       * Hover and selection live on a wrapper so they scale the WHOLE part.
       * `transform-box: fill-box` makes the origin the part's own centre —
       * without it an SVG scale pulls everything toward the canvas origin.
       */}
      <g
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className="cursor-pointer transition-transform duration-150 hover:scale-[1.035]"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/* Drop shadow: parts sit above the board, cavities do not. */}
        {slot.part && (
          <rect x={g.x + 1.5} y={g.y + 2} width={g.w} height={g.h} rx="2" fill="#00000055" />
        )}
        <SlotBody slot={slot} g={g} kind={board} />
        {selected && (
          <rect
            x={g.x - 1.5}
            y={g.y - 1.5}
            width={g.w + 3}
            height={g.h + 3}
            rx="2.5"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1.4"
          />
        )}
      </g>

      {/* Fasteners sit on the edge they actually hold. */}
      {slot.fasteners.map((f, i) => {
        const along = slot.fasteners.length === 1 ? 0.5 : i / (slot.fasteners.length - 1);
        // Clips cap the ENDS of a DIMM; screws and handles ride the near edge.
        const isEnd = f.kind === "clip" || f.kind === "zif" || f.kind === "handle";
        const cx = vertical
          ? g.x + g.w / 2
          : isEnd
            ? g.x + (along < 0.5 ? -4 : g.w + 4)
            : g.x + 6 + along * (g.w - 12);
        const cy = vertical
          ? isEnd
            ? g.y + (along < 0.5 ? -4 : g.h + 4)
            : g.y + 6 + along * (g.h - 12)
          : g.y + g.h + 4;
        return (
          <FastenerVisual
            key={f.id}
            f={f}
            cx={cx}
            cy={cy}
            vertical={vertical}
            onClick={() => onFastener(f)}
          />
        );
      })}

      {slot.part?.faulty && (
        <g className="pointer-events-none">
          <rect x={g.x} y={g.y + g.h / 2 - 5} width={g.w} height="10" fill="#7f1d1d" opacity="0.55" />
          <text
            x={g.x + g.w / 2}
            y={g.y + g.h / 2 + 3}
            fontSize="6"
            textAnchor="middle"
            fill="#fecaca"
            className="select-none font-mono"
          >
            FAILED
          </text>
        </g>
      )}
    </g>
  );
}

/** The verb that matches the hardware — a latch flips, a handle pulls. */
function fastenerState(f: Fastener): string {
  if (!f.fastened) return f.kind === "zif" ? "flipped up" : f.kind === "handle" ? "pulled" : "released";
  if (f.kind === "clip") return "closed";
  if (f.kind === "zif") return "latched";
  if (f.kind === "handle") return "seated";
  return "driven";
}

function Inspector({
  slot,
  board,
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
  board: BoardKind;
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
      {/* A zoomed view of the same vector used on the board — one definition,
          so the panel can never show a part the board does not. */}
      <PartPortrait slot={slot} kind={board} />
      <h3 className="mt-2.5 text-[12px] font-semibold text-gray-100">{slot.label}</h3>
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
              <span className="shrink-0 text-[9px] text-gray-500">{fastenerState(f)}</span>
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
