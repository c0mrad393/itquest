"use client";

/**
 * Desktop PC Simulator — the workbench
 * ====================================
 * One SVG, one coordinate space, strict paint order.
 *
 * ── EVERY POSITION COMES FROM geometry.ts ───────────────────────────────────
 *
 * There are no 0-100 poses left in this file and no CSS positioning of parts.
 * A part is on the tray (`trayBox`) or in its socket (`seatBox`), both in the
 * same 1600x1000 space, and the transition between them is an interpolation of
 * two boxes the model supplies. The view decides nothing about where anything
 * belongs — which is the property the previous renderer lacked and why its
 * scales drifted.
 *
 * ── PAINT ORDER IS DOCUMENT ORDER ───────────────────────────────────────────
 *
 * SVG has no z-index. The layers below are emitted in sequence — bench, case,
 * board, sockets and standoffs, seated parts, cables, fasteners, and finally
 * the dragged part — so a part physically cannot draw over a screw unless it
 * is in a later group. This is enforced by structure, not by a property.
 *
 * ── DRAG IS POINTER EVENTS IN CANVAS SPACE ──────────────────────────────────
 *
 * Client coordinates are converted through the SVG's own CTM, so the drag
 * tracks the cursor exactly at any zoom or pane size. Release calls
 * `snapTarget`, which refuses outside its radius — a part dropped nowhere near
 * a slot animates back to the tray rather than teleporting into one.
 */

import { useCallback, useRef, useState } from "react";
import { useDesktopSimStore } from "@/lib/desktop-sim/store";
import {
  CABLES,
  PARTS,
  blockedBy,
  cableReady,
  isInstalled,
  railReading,
  type CableId,
  type PartId,
  type RailReading,
} from "@/lib/desktop-sim/parts";
import {
  BOARD,
  CANVAS,
  CASE_INNER,
  CASE_OUTER,
  PSU_BAY,
  SNAP_RADIUS,
  STANDOFFS,
  ZONES,
  mm,
  artTransform,
  rectOf,
  seatBox,
  snapTarget,
  trayBox,
  zoneFor,
  type Box,
} from "@/lib/desktop-sim/geometry";
import { PAL, PART_VECTOR, SEAT_VECTOR, VectorScrews } from "./VectorParts";
import {
  BiosSetupScreen,
  OsInstallScreen,
  PostHaltScreen,
  ProvisioningScreen,
  RunningScreen,
} from "./FirmwareScreens";
import { useInfraStore } from "@/lib/infra/store";
import { BENCH, StatusBar, ToolRail, type ToolId } from "./WorkbenchShell";

interface DragState {
  // Typed to the union, not widened to string: the store's actions take a
  // PartId, and a cast here would let a typo reach `place()` at runtime.
  partId: PartId;
  /** Pointer position in canvas space. */
  x: number;
  y: number;
  /** Grab offset, so the part does not jump to centre on pick-up. */
  dx: number;
  dy: number;
}

/**
 * A ticket the bench is working, when it is working one.
 *
 * The bench stays usable with no assignment at all — free practice is a
 * legitimate mode and the most common way someone meets it. An assignment
 * only adds the work order: who the machine is for and what it must satisfy
 * before it can be signed off.
 */
export interface BenchAssignment {
  ticketCode: string;
  forWhom: string;
  minRamGb: number;
  minDiskGb: number;
  joinDomain: boolean;
}

export default function DesktopSimulator({ assignment }: { assignment?: BenchAssignment } = {}) {
  const build = useDesktopSimStore((s) => s.build);
  const place = useDesktopSimStore((s) => s.place);
  const route = useDesktopSimStore((s) => s.route);
  const restart = useDesktopSimStore((s) => s.restart);
  const status = useDesktopSimStore((s) => s.status)();
  const guidance = useDesktopSimStore((s) => s.guidance)();
  const phase = useDesktopSimStore((s) => s.phase);
  const powerOn = useDesktopSimStore((s) => s.powerOn);
  const registeredAs = useDesktopSimStore((s) => s.registeredAs);
  const setRegistered = useDesktopSimStore((s) => s.setRegistered);
  const commission = useInfraStore((s) => s.commissionBenchMachine);
  const joinToDomain = useInfraStore((s) => s.joinBenchMachineToDomain);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Screw mode: the screwdriver is a tool you pick up, not an always-on verb. */
  const [tool, setTool] = useState<ToolId | null>(null);
  const screwMode = tool === "screwdriver";
  const [screws, setScrews] = useState<string[]>([]);
  /*
   * Combing is cosmetic, so it lives here rather than in the build model. The
   * store carries what the machine IS — what is fitted and what is plugged in.
   * A tidy loom changes none of that, and putting it in the model would make
   * POST and the win-conditions answerable by cable dressing.
   */
  const [combed, setCombed] = useState<CableId[]>([]);
  /** Last multimeter probe. Derived on read, held only to render the panel. */
  const [reading, setReading] = useState<RailReading | null>(null);

  /** Client point to canvas point, through the SVG's own transform. */
  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // Firmware takes the whole surface once the machine is powered.
  if (phase === "post-halt") return <PostHaltScreen />;
  if (phase === "bios") return <BiosSetupScreen />;
  if (phase === "installing") {
    return <OsInstallScreen onCommit={(spec) => setRegistered(commission({ machine: "desktop", ...spec }))} />;
  }
  if (phase === "provisioning") {
    return (
      <ProvisioningScreen
        onJoined={(domain) => {
          if (registeredAs) joinToDomain(registeredAs, domain);
        }}
      />
    );
  }
  if (phase === "running") return <RunningScreen hostname={registeredAs} />;

  const dragged = drag ? PARTS.find((p) => p.id === drag.partId) ?? null : null;
  const dragTarget = drag ? snapTarget(drag.partId, { x: drag.x, y: drag.y }) : null;
  // The CPU die, which the paste tool targets. Falls back to the board so the
  // optional chain below never has to guard a missing zone.
  const pasteZone = zoneFor("paste")?.box ?? BOARD;

  function onPointerDown(e: React.PointerEvent, partId: PartId) {
    if (screwMode) return;
    if (isInstalled(build, partId) || blockedBy(build, partId)) return;
    const p = toCanvas(e);
    const tb = trayBox(partId);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ partId, x: p.x, y: p.y, dx: p.x - tb.x, dy: p.y - tb.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = toCanvas(e);
    setDrag({ ...drag, x: p.x, y: p.y });
  }

  /**
   * A cable does whatever the tool in your hand does to it.
   *
   * Bare hands route it, the comb dresses a run you have already made, and the
   * multimeter probes it without changing anything — a meter that altered the
   * circuit would teach the opposite of what a meter is for.
   */
  function onCable(id: CableId) {
    if (tool === "multimeter") {
      setReading(railReading(build, id));
      return;
    }
    if (tool === "comb") {
      // Nothing to dress until the run exists.
      if (!build.connected.includes(id)) return;
      setCombed((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
      return;
    }
    if (screwMode) return;
    route(id);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // The model decides. Outside the radius this is null and the part simply
    // stops being dragged, which returns it to its tray box.
    const target = snapTarget(drag.partId, { x: drag.x, y: drag.y });
    if (target) place(drag.partId);
    setDrag(null);
  }

  return (
    <div className="flex h-full flex-col" style={{ background: BENCH.deck }}>
      <StatusBar build={build} complete={status.complete} powered={false} />

      {assignment && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[10px]"
          style={{ borderColor: BENCH.line, background: "#0d1319" }}
        >
          <span className="font-mono font-semibold" style={{ color: BENCH.accent }}>
            {assignment.ticketCode}
          </span>
          <span style={{ color: BENCH.text }}>Build for {assignment.forWhom}</span>
          <span style={{ color: BENCH.textDim }}>
            Sign-off needs {assignment.minRamGb}GB memory, a {assignment.minDiskGb}GB disk
            {assignment.joinDomain ? ", and the machine joined to the domain" : ""}.
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
            style={{ borderColor: BENCH.line, background: BENCH.deckHi }}
          >
            <div className="min-w-0">
              <div className="text-[12px] font-semibold" style={{ color: BENCH.text }}>
                Build bench — ATX desktop
              </div>
              <div className="truncate text-[10px]" style={{ color: BENCH.textDim }}>
                {tool === "screwdriver"
                  ? "Screw mode — click a standoff to drive it."
                  : tool === "paste"
                    ? isInstalled(build, "paste")
                      ? "Paste already applied."
                      : blockedBy(build, "paste")
                        ? "Fit the CPU before pasting it."
                        : "Dab the CPU die — the highlighted patch."
                    : tool === "comb"
                      ? "Click a routed cable to dress it."
                      : tool === "multimeter"
                        ? "Probe a cable to read its rail."
                        : guidance
                          ? `${guidance.label} — drag it into the case.`
                          : "Build complete. Power on to POST."}
              </div>
            </div>

            {/* Multimeter readout — only while the probe is in hand. */}
            {tool === "multimeter" && (
              <div
                className="ml-auto shrink-0 rounded border px-2.5 py-1 font-mono text-[10px]"
                style={{ borderColor: BENCH.line, background: "#0b0f13", color: BENCH.textDim }}
              >
                {reading ? (
                  <span>
                    <span style={{ color: BENCH.text }}>{reading.label}</span>{" "}
                    <span style={{ color: reading.live ? BENCH.ok : "#e0574a" }}>
                      {reading.actualV.toFixed(2)}V
                    </span>{" "}
                    <span>/ {reading.nominalV.toFixed(1)}V nominal — {reading.note}</span>
                  </span>
                ) : (
                  <span>Probe a rail to take a reading.</span>
                )}
              </div>
            )}

            <div className={`${tool === "multimeter" ? "" : "ml-auto"} flex items-center gap-2`}>
              <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: BENCH.line }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${status.progress * 100}%`, background: BENCH.ok }}
                />
              </div>
              <span className="font-mono text-[10px]" style={{ color: BENCH.textDim }}>
                {Math.round(status.progress * 100)}%
              </span>
              <button
                onClick={powerOn}
                className="rounded border px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-90"
                style={{ borderColor: BENCH.accent, background: BENCH.accent, color: "#08121c" }}
              >
                Power on
              </button>
              <button
                onClick={() => {
                  restart();
                  setScrews([]);
                  setCombed([]);
                  setReading(null);
                }}
                className="rounded border px-2.5 py-1 text-[10px]"
                style={{ borderColor: BENCH.line, color: BENCH.textDim }}
              >
                Reset
              </button>
            </div>
          </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full max-h-full w-full"
          style={{ touchAction: "none", cursor: screwMode ? "crosshair" : undefined }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setDrag(null)}
          role="img"
          aria-label="PC build bench"
        >
          <defs>
            <linearGradient id="ds-steel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4f6f8" />
              <stop offset="45%" stopColor="#cfd6dd" />
              <stop offset="100%" stopColor="#98a2ac" />
            </linearGradient>
            <linearGradient id="ds-caseWall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b656f" />
              <stop offset="100%" stopColor="#333b43" />
            </linearGradient>
            <radialGradient id="ds-screw" cx="0.34" cy="0.3" r="0.8">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#c9d0d7" />
              <stop offset="100%" stopColor="#6f7881" />
            </radialGradient>
            <filter id="ds-lift" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#5b6470" floodOpacity="0.32" />
            </filter>
            <filter id="ds-carry" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#3c4550" floodOpacity="0.4" />
            </filter>
            <pattern id="ds-brushed" width="6" height="4" patternUnits="userSpaceOnUse">
              <rect width="6" height="4" fill="none" />
              <rect width="6" height="1" fill="#ffffff" fillOpacity="0.022" />
              <rect y="2" width="6" height="1" fill="#000000" fillOpacity="0.06" />
            </pattern>
            <filter id="ds-neon" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#22d3ee" floodOpacity="1" />
            </filter>
          </defs>

          {/* ── LAYER 0 — bench ─────────────────────────────────────────── */}
          {/* Brushed deck: a dark ground with fine horizontal grain, drawn as
              a pattern so it costs one rect rather than a few hundred lines. */}
          <rect x="0" y="0" width={CANVAS.w} height={CANVAS.h} fill={BENCH.deck} />
          <rect x="0" y="0" width={CANVAS.w} height={CANVAS.h} fill="url(#ds-brushed)" />

          {/* ── LAYER 1 — case shell ───────────────────────────────────── */}
          <g filter="url(#ds-lift)">
            <rect {...rectOf(CASE_OUTER)} rx="10" fill="url(#ds-caseWall)" />
            <rect {...rectOf(CASE_INNER)} rx="4" fill="#23292f" />
            {/* Rear grommets, right edge of the tray */}
            {[0.22, 0.48, 0.74].map((f, i) => (
              <rect
                key={i}
                x={CASE_INNER.x + CASE_INNER.w - mm(14)}
                y={CASE_INNER.y + CASE_INNER.h * f}
                width={mm(9)}
                height={mm(26)}
                rx={mm(4.5)}
                fill="#12161a"
                stroke="#39424b"
                strokeWidth="3"
              />
            ))}
            {/* PSU basement divider */}
            <rect
              x={CASE_INNER.x}
              y={PSU_BAY.y - mm(8)}
              width={CASE_INNER.w}
              height={mm(4)}
              fill="#39424b"
            />
          </g>

          {/* ── LAYER 2 — motherboard, if fitted ───────────────────────── */}
          {isInstalled(build, "mobo") && (
            <g filter="url(#ds-lift)">
              <PartArt id="mobo" box={BOARD} />
            </g>
          )}

          {/* ── LAYER 3 — sockets and standoffs ────────────────────────── */}
          <g>
            {/* Empty zones read as recessed cavities so a slot looks like a hole */}
            {ZONES.filter((z) => z.id !== "board-tray" && z.id !== "paste").map((z) => {
              const filled = isInstalled(build, z.accepts);
              if (filled) return null;
              return (
                <rect
                  key={z.id}
                  {...rectOf(z.box)}
                  rx="3"
                  fill="#11161b"
                  opacity={isInstalled(build, "mobo") || z.id === "psu-bay" ? 0.85 : 0.25}
                />
              );
            })}
            {STANDOFFS.map((s) => {
              const done = screws.includes(s.id);
              return (
                <g
                  key={s.id}
                  onClick={() => {
                    if (!screwMode) return;
                    setScrews((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]));
                  }}
                  className={screwMode ? "cursor-pointer" : ""}
                >
                  <circle cx={s.x} cy={s.y} r={mm(5)} fill="#4a545e" />
                  <g
                    style={{
                      transform: `rotate(${done ? 90 : 0}deg)`,
                      transformOrigin: `${s.x}px ${s.y}px`,
                      transition: "transform 260ms ease-out",
                      opacity: done ? 1 : 0.45,
                    }}
                  >
                    <circle cx={s.x} cy={s.y} r={mm(3)} fill="url(#ds-screw)" />
                    <rect x={s.x - mm(2)} y={s.y - 1.2} width={mm(4)} height="2.4" rx="1" fill="#49525b" />
                    <rect x={s.x - 1.2} y={s.y - mm(2)} width="2.4" height={mm(4)} rx="1" fill="#49525b" />
                  </g>
                </g>
              );
            })}
          </g>

          {/* ── LAYER 4 — seated parts ─────────────────────────────────── */}
          <g>
            {PARTS.filter((p) => p.id !== "mobo" && isInstalled(build, p.id)).map((p) => {
              const b = seatBox(p.id);
              if (!b) return null;
              return (
                <g key={p.id} filter="url(#ds-lift)" className="ds-seat">
                  <PartArt id={p.id} box={b} seated />
                </g>
              );
            })}
          </g>

          {/*
            The thermal-paste tool: a second, equally legitimate route to the
            same state. Dragging the tube in and dabbing the die with the tool
            both call `place("paste")`, so the model cannot tell them apart —
            the same GUI-or-CLI parity the rest of the estate is built on.

            This sits AFTER the sockets and the seated CPU deliberately. SVG has
            no z-index, so an earlier target is a buried one: drawn up with the
            board it rendered correctly and swallowed every click, because the
            socket cavity and the CPU art were painted over the top of it.
          */}
          {tool === "paste" && !isInstalled(build, "paste") && !blockedBy(build, "paste") && (
            <rect
              {...rectOf(pasteZone)}
              rx="3"
              fill={BENCH.ok}
              opacity="0.22"
              className="cursor-pointer"
              onClick={() => place("paste")}
            >
              <title>Apply thermal paste to the CPU die</title>
            </rect>
          )}

          {/* ── LAYER 5 — cables, rear-grommet routed ──────────────────── */}
          <g>
            {CABLES.map((c) => {
              if (!cableReady(build, c.id)) return null;
              const done = build.connected.includes(c.id);
              // Grommet column, just inside the right wall of the tray.
              const gx = CASE_INNER.x + CASE_INNER.w - mm(9);
              const from = { x: PSU_BAY.x + PSU_BAY.w * 0.86, y: PSU_BAY.y + mm(10) };
              const to = {
                x: BOARD.x + BOARD.w * (c.id === "pcie8" ? 0.34 : 0.97),
                y: BOARD.y + BOARD.h * (c.id === "cpu8" ? 0.06 : c.id === "pcie8" ? 0.78 : 0.34),
              };
              const entry = { x: gx, y: from.y - mm(12) };
              const exit = { x: gx, y: to.y };

              /*
               * Three segments: out of the PSU to the nearest grommet, BEHIND
               * the motherboard tray, then out again beside the header. The
               * middle run is drawn dim and dashed because it is genuinely
               * hidden — that is what makes the routing read as tidy rather
               * than as a wire thrown across the board.
               */
              const stubIn = `M${from.x} ${from.y} C ${entry.x} ${from.y}, ${entry.x} ${entry.y}, ${entry.x} ${entry.y}`;
              const behind = `M${entry.x} ${entry.y} L${exit.x} ${exit.y}`;
              const stubOut = `M${exit.x} ${exit.y} C ${exit.x - mm(14)} ${exit.y}, ${to.x + mm(14)} ${to.y}, ${to.x} ${to.y}`;

              const sleeve = (d: string) => (
                <>
                  <path d={d} stroke="#0c1013" strokeWidth="11" fill="none" strokeLinecap="round" />
                  <path d={d} stroke={c.colour} strokeWidth="7" fill="none" strokeLinecap="round" />
                  {/* Paracord weave: short dashes over the sleeve colour. */}
                  <path
                    d={d}
                    stroke="#0c1013"
                    strokeOpacity="0.4"
                    strokeWidth="7"
                    fill="none"
                    strokeDasharray="3 6"
                    strokeLinecap="butt"
                  />
                </>
              );

              /*
               * A combed run is the same route pulled square. Real cable combs
               * do exactly this: they hold the conductors parallel so the loom
               * leaves the connector at a right angle instead of drooping, so
               * the dressed version swaps the slack curve for straight legs.
               */
              const isCombed = combed.includes(c.id);
              const combIn = `M${from.x} ${from.y} L${entry.x} ${from.y} L${entry.x} ${entry.y}`;
              const combOut = `M${exit.x} ${exit.y} L${to.x + mm(16)} ${exit.y} L${to.x + mm(16)} ${to.y} L${to.x} ${to.y}`;

              return (
                <g key={c.id} onClick={() => onCable(c.id)} className="cursor-pointer" opacity={done ? 1 : 0.28}>
                  {/* Hidden run, dimmed — it is behind the tray. */}
                  <path d={behind} stroke="#0c1013" strokeWidth="9" fill="none" opacity="0.5" strokeDasharray="7 7" />
                  {sleeve(isCombed ? combIn : stubIn)}
                  {sleeve(isCombed ? combOut : stubOut)}
                  {isCombed && (
                    /* The comb itself, clipped over the dressed leg. */
                    <g>
                      <rect
                        x={to.x + mm(16) - mm(3)}
                        y={exit.y + (to.y - exit.y) / 2 - mm(5)}
                        width={mm(6)}
                        height={mm(10)}
                        rx="1.5"
                        fill="#2c333b"
                        stroke="#59636d"
                        strokeWidth="1"
                      />
                      {[0, 1, 2].map((i) => (
                        <rect
                          key={i}
                          x={to.x + mm(16) - mm(2)}
                          y={exit.y + (to.y - exit.y) / 2 - mm(3.4) + i * mm(2.6)}
                          width={mm(4)}
                          height="1.6"
                          rx="0.8"
                          fill={c.colour}
                          opacity="0.75"
                        />
                      ))}
                    </g>
                  )}
                  {/* Connector shell at the header */}
                  <rect x={to.x - mm(7)} y={to.y - mm(4)} width={mm(14)} height={mm(8)} rx="2" fill={PAL.paper} />
                </g>
              );
            })}
          </g>

          {/* ── LAYER 6 — tray parts, and the snap silhouette ──────────── */}
          <g>
            {ZONES.map((z) => {
              if (!drag || dragTarget?.id !== z.id) return null;
              return (
                <rect
                  key={`snap-${z.id}`}
                  {...rectOf(z.box)}
                  rx="4"
                  fill="#22d3ee"
                  fillOpacity="0.18"
                  stroke="#22d3ee"
                  strokeWidth="3"
                  filter="url(#ds-neon)"
                />
              );
            })}

            {PARTS.filter((p) => !isInstalled(build, p.id) && drag?.partId !== p.id).map((p) => {
              const b = trayBox(p.id);
              const blocked = blockedBy(build, p.id);
              return (
                <g
                  key={p.id}
                  onPointerDown={(e) => onPointerDown(e, p.id)}
                  className={blocked ? "cursor-not-allowed" : "cursor-grab"}
                  opacity={blocked ? 0.45 : 1}
                  filter="url(#ds-lift)"
                >
                  <PartArt id={p.id} box={b} />
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h + 18}
                    textAnchor="middle"
                    fontSize="15"
                    fill={blocked ? "#9aa4b0" : PAL.ink}
                    className="select-none"
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}

            <g transform={`translate(${CANVAS.w - 150} ${CANVAS.h - 120}) scale(1.5)`}>
              <VectorScrews />
            </g>
          </g>

          {/* ── LAYER 7 — the part in hand, topmost ────────────────────── */}
          {drag && dragged && (
            <g filter="url(#ds-carry)" style={{ pointerEvents: "none" }}>
              <PartArt
                id={drag.partId}
                box={{
                  x: drag.x - drag.dx,
                  y: drag.y - drag.dy,
                  w: trayBox(drag.partId).w,
                  h: trayBox(drag.partId).h,
                }}
              />
            </g>
          )}
        </svg>
      </div>

      <footer
        className="shrink-0 border-t px-4 py-2"
        style={{ borderColor: BENCH.line, background: BENCH.deckHi }}>
        <div className="flex flex-wrap gap-1.5">
          {status.faults.length === 0 ? (
            <span className="text-[10px]" style={{ color: BENCH.ok }}>
              Nothing outstanding.
            </span>
          ) : (
            status.faults.slice(0, 7).map((f, i) => (
              <span
                key={`${i}-${f}`}
                className="rounded-full px-2 py-0.5 text-[9px]"
                style={{ background: BENCH.panelHi, color: BENCH.textDim }}
              >
                {f}
              </span>
            ))
          )}
        </div>
      </footer>
        </div>

        <ToolRail
          build={build}
          activeTool={tool}
          onTool={setTool}
          onPick={() => undefined}
          blockedFor={(id) => blockedBy(build, id)}
        />
      </div>
    </div>
  );
}

/**
 * Places a part's artwork into a box.
 *
 * The vector components draw in a normalised 0-100 space; this is the ONE
 * place that maps them onto real geometry. Keeping the art normalised is what
 * lets the same component render on the tray and in a socket at different
 * sizes without a second copy.
 */
function PartArt({ id, box, seated = false }: { id: PartId; box: Box; seated?: boolean }) {
  // A seated part may have its own view — a DIMM standing in a slot looks
  // nothing like the same DIMM lying on the bench. Anything without one keeps
  // its bench artwork.
  const Vector = (seated && SEAT_VECTOR[id]) || PART_VECTOR[id];
  if (!Vector) return null;
  // UNIFORM scale, and the quarter turn for parts that stand in their slot.
  // Two different scale factors is what stretched every part.
  return (
    <g transform={artTransform(id, box, seated)}>
      <Vector />
    </g>
  );
}
