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
import {
  blockedReason,
  canRemove,
  cablesFor,
  type Fastener,
  type MachineKind,
  type Part,
  type Slot,
} from "@/lib/hardware/rig";
import { useInfraStore } from "@/lib/infra/store";
import { AppIcon } from "@/components/ui/app-icons";
import { BiosSetupScreen, OsInstallScreen, PostHaltScreen, RunningScreen } from "./BiosScreen";
import {
  BOARD,
  BOARD_SIZE,
  BoardSubstrate,
  ChassisFrame,
  ChassisFurniture,
  RigDefs,
  ScrewdriverIcon,
  SlotBody,
  CableRun,
  FastenerVisual,
  PartPortrait,
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
  /*
   * The part currently in hand.
   *
   * Click-to-install rather than HTML5 drag: a pointer drag inside an SVG that
   * is itself inside a draggable window fights the window manager for the same
   * gesture, and the failure mode is a part that "sticks" to the cursor while
   * the window slides away underneath. Picking up and placing is unambiguous,
   * and it is what the store models anyway — tray to slot.
   */
  const [held, setHeld] = useState<string | null>(null);

  const heldPart = rig.tray.find((p) => p.id === held) ?? null;
  /** Slots this part could legally go into — the model decides, not the view. */
  const validTargets = heldPart
    ? rig.slots.filter((sl) => !sl.part && sl.kind === heldPart.kind).map((sl) => sl.id)
    : [];

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
              loadScenario(
                v === "cpu-fan-unplugged" ? "cpu-fan-unplugged"
                : v === "none" ? "none"
                : v === "bare-build" ? "bare-build"
                : "faulty-ram",
              );
              setPosted(null);
              setHeld(null);
            }}
            className="rounded border border-edge bg-panel px-2 py-1 text-[10px] text-gray-200"
          >
            <option value="faulty-ram">Scenario — failed RAM stick</option>
            <option value="cpu-fan-unplugged">Scenario — CPU fan unplugged</option>
            <option value="none">Scenario — healthy machine</option>
            <option value="bare-build">Job — build from parts</option>
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
            <RigDefs />
            {/* The case, drawn around the board rather than under it, so the
                topology coordinates keep meaning what they meant. */}
            <ChassisFrame w={BOARD_SIZE[machine].w * U} h={BOARD_SIZE[machine].h * U} />
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
                dropTarget={validTargets.includes(slot.id)}
                onSelect={() => {
                  // Holding a compatible part turns a click into an install.
                  if (held && validTargets.includes(slot.id)) {
                    insertComponent(slot.id, held);
                    setHeld(null);
                    select(slot.id);
                    return;
                  }
                  select(slot.id);
                }}
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

        {/* ── Parts bin ──────────────────────────────────────────────────── */}
        <PartsBin
          board={machine}
          tray={rig.tray}
          held={held}
          onPick={(id) => setHeld((cur) => (cur === id ? null : id))}
        />

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
  dropTarget,
  onSelect,
  onFastener,
}: {
  slot: Slot;
  board: BoardKind;
  selected: boolean;
  highlighted: boolean;
  dropTarget: boolean;
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

      {/* A valid destination for the part in hand. Green, pulsing, and only on
          slots the MODEL says will accept it — never a guess in the view. */}
      {dropTarget && (
        <g>
          <rect
            x={g.x - 4} y={g.y - 4} width={g.w + 8} height={g.h + 8} rx="3"
            fill="#22c55e" fillOpacity="0.16" stroke="#4ade80" strokeWidth="1.8"
          >
            <animate attributeName="fill-opacity" values="0.1;0.28;0.1" dur="1.4s" repeatCount="indefinite" />
          </rect>
        </g>
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
        className="cursor-pointer transition-transform duration-150 hover:scale-[1.045] [&:hover>.lit]:opacity-100"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/*
         * Cyan bloom on hover, always on when selected. Painted as a filtered
         * outline BEHIND the part rather than a filter on the part itself —
         * glowing the component would wash out the materials underneath it,
         * which is the whole thing we just spent this pass building.
         */}
        <rect
          className={`lit transition-opacity duration-150 ${selected ? "opacity-100" : "opacity-0"}`}
          x={g.x - 1}
          y={g.y - 1}
          width={g.w + 2}
          height={g.h + 2}
          rx="2.5"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.6"
          filter="url(#hw-glow)"
        />
        <SlotBody slot={slot} g={g} kind={board} />

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


/**
 * The workbench surface: parts waiting to go in, and the tools to fit them.
 *
 * Reads `rig.tray`, which is the store's own idea of "not installed yet" — so a
 * part removed during a repair lands here beside the parts of a fresh build,
 * because to the machine those are the same thing.
 *
 * Each tile draws the REAL part vector at bin scale rather than an icon, so the
 * thing you pick up is recognisably the thing that appears in the slot.
 */
function PartsBin({
  board,
  tray,
  held,
  onPick,
}: {
  board: BoardKind;
  // The real Part type: widening to `string` here would let a bin tile render
  // a kind the board has no body for, and it would fail silently.
  tray: Part[];
  held: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-l border-edge bg-[#14181f]">
      <header className="shrink-0 border-b border-edge px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Parts bin</h3>
        <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
          {held ? "Click a highlighted slot to fit it." : "Click a part to pick it up."}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto term-scroll p-2">
        {tray.length === 0 ? (
          <p className="px-1 py-3 text-[10px] leading-relaxed text-gray-500">
            Bin is empty — everything is in the machine.
          </p>
        ) : (
          tray.map((p) => {
            const picked = held === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                className={`mb-1.5 flex w-full items-center gap-2 rounded-md border p-1.5 text-left transition-all ${
                  picked
                    ? "border-info bg-info/15 shadow-[0_0_12px_-2px] shadow-info"
                    : "border-edge hover:border-gray-500 hover:bg-gray-500/10"
                }`}
              >
                <svg viewBox="0 0 54 30" className="h-8 w-14 shrink-0 rounded bg-[#0a0f16]">
                  <RigDefs />
                  {/* The part at bin scale, using the same body components. */}
                  <SlotBody
                    slot={{
                      id: p.id, kind: p.kind, label: p.model,
                      x: 0, y: 0, w: 0, h: 0,
                      part: p,
                      fasteners: [], cableIds: [],
                    }}
                    g={{ x: 5, y: 5, w: 44, h: 20 }}
                    kind={board}
                  />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium text-gray-100">{p.model}</span>
                  <span className="block text-[9px] uppercase tracking-wide text-gray-500">{p.kind}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Tools. The screwdriver is not a mode — every fastener is already
          clickable — but a bench without one does not read as a bench. */}
      <footer className="shrink-0 border-t border-edge px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ScrewdriverIcon size={22} />
          <span className="text-[9px] leading-tight text-gray-500">
            Screws and clips are clicked directly on the board.
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <svg key={i} viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <RigDefs />
              <circle cx="6" cy="6" r="4.4" fill="url(#hw-screw)" />
              <rect x="3.2" y="5.4" width="5.6" height="1.2" rx="0.4" fill="#3f464f" />
              <rect x="5.4" y="3.2" width="1.2" height="5.6" rx="0.4" fill="#3f464f" />
            </svg>
          ))}
        </div>
      </footer>
    </aside>
  );
}
