"use client";

/**
 * Desktop PC Simulator — the workbench view
 * =========================================
 * Ground-up replacement for the hardware lab, scoped to one desktop build and
 * built visuals-first against the reference illustration.
 *
 * ── ONE POSITION SYSTEM, TWO POSES ──────────────────────────────────────────
 *
 * A part has a `desk` pose and a `seat` rect, both in `parts.ts`. This view
 * renders it at one or the other and lets CSS interpolate between them, which
 * is why "animate into the case" needed no animation code: the transform
 * changes and the transition does the rest. Nothing here knows a part's
 * coordinates — it asks the model.
 *
 * ── THE MODEL REFUSES, THE VIEW EXPLAINS ────────────────────────────────────
 *
 * `placeable` and `blockedBy` come from `parts.ts`. Clicking a part that is not
 * ready does not silently fail: the desk tag says which part has to go in
 * first, because "fit the motherboard first" is instruction and a dimmed card
 * is a puzzle.
 *
 * SVG and CSS only — no raster assets, no emoji.
 */

import { useDesktopSimStore } from "@/lib/desktop-sim/store";
import {
  CABLES,
  PARTS,
  blockedBy,
  cableReady,
  isInstalled,
  type PartDef,
} from "@/lib/desktop-sim/parts";
import { PAL, PART_VECTOR, VectorScrews } from "./VectorParts";
import {
  BiosSetupScreen,
  OsInstallScreen,
  PostHaltScreen,
  ProvisioningScreen,
  RunningScreen,
} from "./FirmwareScreens";
import { useInfraStore } from "@/lib/infra/store";

/** Desk space is 0-100 in both axes; this is the only place that changes. */
const VB = { w: 100, h: 100 };

export default function DesktopSimulator() {
  const build = useDesktopSimStore((s) => s.build);
  const held = useDesktopSimStore((s) => s.held);
  const hovered = useDesktopSimStore((s) => s.hovered);
  const pick = useDesktopSimStore((s) => s.pick);
  const hover = useDesktopSimStore((s) => s.hover);
  const place = useDesktopSimStore((s) => s.place);
  const route = useDesktopSimStore((s) => s.route);
  const restart = useDesktopSimStore((s) => s.restart);
  const status = useDesktopSimStore((s) => s.status)();
  const guidance = useDesktopSimStore((s) => s.guidance)();
  /*
   * Every hook is read BEFORE the phase early-returns below. React counts
   * hooks positionally, so one read further down would throw "rendered fewer
   * hooks than expected" the first time the machine powers on.
   */
  const phase = useDesktopSimStore((s) => s.phase);
  const powerOn = useDesktopSimStore((s) => s.powerOn);
  const registeredAs = useDesktopSimStore((s) => s.registeredAs);
  const setRegistered = useDesktopSimStore((s) => s.setRegistered);
  const commission = useInfraStore((s) => s.commissionBenchMachine);
  const joinToDomain = useInfraStore((s) => s.joinBenchMachineToDomain);

  /*
   * Firmware takes the whole surface, as it does on a real machine: once you
   * press power there is no bench to look at, only what the box is showing.
   */
  if (phase === "post-halt") return <PostHaltScreen />;
  if (phase === "bios") return <BiosSetupScreen />;
  if (phase === "installing") {
    return (
      <OsInstallScreen
        onCommit={(spec) => setRegistered(commission({ machine: "desktop", ...spec }))}
      />
    );
  }
  if (phase === "provisioning") {
    return (
      <ProvisioningScreen
        onJoined={(domain) => {
          // Written through to the estate, so the machine genuinely appears as
          // a domain member rather than the bench merely claiming it did.
          if (registeredAs) joinToDomain(registeredAs, domain);
        }}
      />
    );
  }
  if (phase === "running") return <RunningScreen hostname={registeredAs} />;

  return (
    <div className="flex h-full flex-col" style={{ background: PAL.surface }}>
      {/* ── Work order ──────────────────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5"
        style={{ borderColor: PAL.surfaceEdge, background: "#fafbfc" }}
      >
        <div className="min-w-0">
          <div className="text-[12px] font-semibold" style={{ color: PAL.ink }}>
            Build bench — ATX desktop
          </div>
          <div className="truncate text-[10px]" style={{ color: "#7a8493" }}>
            {guidance ? guidance.label : "Build complete — every part seated and every cable routed."}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Progress, derived from parts + cables done. */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full" style={{ background: PAL.surfaceEdge }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${status.progress * 100}%`, background: PAL.boardBlue }}
              />
            </div>
            <span className="font-mono text-[10px]" style={{ color: "#7a8493" }}>
              {Math.round(status.progress * 100)}%
            </span>
          </div>
          <button
            onClick={powerOn}
            className="rounded border px-2.5 py-1 text-[10px] font-medium transition-colors"
            style={{ borderColor: PAL.boardBlueDark, background: PAL.boardBlue, color: "#fff" }}
          >
            Power on
          </button>
          <button
            onClick={restart}
            className="rounded border px-2.5 py-1 text-[10px] transition-colors"
            style={{ borderColor: PAL.surfaceEdge, color: PAL.ink }}
          >
            Reset bench
          </button>
        </div>
      </header>

      {/* ── The desk ────────────────────────────────────────────────────── */}
      {/*
        * The desk fits the pane rather than scrolling.
        *
        * `h-auto w-full` on a square viewBox forces height to match width, which
        * overflows a short pane and hides the lower half of the bench — where
        * half the parts lie. Fitting to the SHORTER axis keeps the whole scene
        * on screen, which is the only way a scatter layout reads at all.
        */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full max-h-full w-full"
          role="img"
          aria-label="Build bench"
        >
          <defs>
            {/* The one shadow in the whole scene. The reference is flat; a part
                lifts off the desk with a soft contact shadow and nothing more. */}
            <filter id="ds-lift" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" floodColor="#93a0b0" floodOpacity="0.35" />
            </filter>
          </defs>

          <rect x="0" y="0" width={VB.w} height={VB.h} fill={PAL.surface} />

          <Chassis />
          <g transform="translate(4 4) scale(0.5)">
            <VectorScrews />
          </g>

          {/* Cables sit under the parts so plugs overlap their sockets. */}
          {CABLES.map((c) => {
            const done = build.connected.includes(c.id);
            const ready = cableReady(build, c.id);
            if (!ready) return null;
            const d = `M${c.from.x} ${c.from.y} C ${c.from.x} ${(c.from.y + c.to.y) / 2}, ${c.to.x} ${(c.from.y + c.to.y) / 2}, ${c.to.x} ${c.to.y}`;
            return (
              <g
                key={c.id}
                onClick={() => route(c.id)}
                className="cursor-pointer"
                opacity={done ? 1 : 0.34}
              >
                <path d={d} stroke={PAL.ink} strokeWidth="2.1" fill="none" strokeLinecap="round" />
                <path d={d} stroke={c.colour} strokeWidth="1.4" fill="none" strokeLinecap="round" />
                <rect x={c.to.x - 1.6} y={c.to.y - 1.1} width="3.2" height="2.2" rx="0.5" fill={PAL.paper} />
              </g>
            );
          })}

          {PARTS.map((p) => (
            <PartOnBench
              key={p.id}
              def={p}
              seated={isInstalled(build, p.id)}
              held={held === p.id}
              hovered={hovered === p.id}
              blocked={blockedBy(build, p.id)}
              onEnter={() => hover(p.id)}
              onLeave={() => hover(null)}
              onClick={() => {
                // One click: pick it up if it can go in, place it if held.
                if (isInstalled(build, p.id)) return;
                if (blockedBy(build, p.id)) return;
                if (held === p.id) place(p.id);
                else pick(p.id);
              }}
            />
          ))}
        </svg>
      </div>

      {/* ── Outstanding work ────────────────────────────────────────────── */}
      <footer
        className="shrink-0 border-t px-4 py-2"
        style={{ borderColor: PAL.surfaceEdge, background: "#fafbfc" }}
      >
        <div className="flex flex-wrap gap-1.5">
          {status.faults.length === 0 ? (
            <span className="text-[10px]" style={{ color: PAL.boardBlueDark }}>
              Nothing outstanding.
            </span>
          ) : (
            status.faults.slice(0, 6).map((f, i) => (
              <span
                key={`${i}-${f}`}
                className="rounded-full px-2 py-0.5 text-[9px]"
                style={{ background: PAL.surfaceEdge, color: "#7a8493" }}
              >
                {f}
              </span>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}

/**
 * The open case: outer shell, PSU shroud, drive cage, motherboard tray.
 *
 * Non-interactive. It is the room the build happens in, and the reference draws
 * it as flat charcoal panels rather than as anything metallic.
 */
function Chassis() {
  return (
    <g className="pointer-events-none">
      <rect x="10" y="10" width="56" height="82" rx="1.5" fill={PAL.inkSoft} />
      <rect x="10" y="10" width="56" height="82" rx="1.5" fill="none" stroke={PAL.ink} strokeWidth="1.2" />
      {/* Motherboard tray, recessed */}
      <rect x="13" y="24" width="48" height="62" rx="1" fill={PAL.ink} />
      {/* PSU shroud, top-left, with its fan grille */}
      <rect x="12" y="12" width="24" height="16" rx="1" fill={PAL.steel} />
      <circle cx="24" cy="20" r="6.4" fill={PAL.ink} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M24 20 L${24 + Math.cos(a) * 6} ${20 + Math.sin(a) * 6} A6 6 0 0 1 ${24 + Math.cos(a + 0.6) * 6} ${20 + Math.sin(a + 0.6) * 6} Z`}
            fill={PAL.steel}
            opacity="0.45"
          />
        );
      })}
      {/* Drive cage / front bays, right column */}
      <rect x="52" y="12" width="12" height="26" rx="1" fill={PAL.steel} />
      {[14, 20, 26, 32].map((y, i) => (
        <rect key={i} x="53.5" y={y} width="9" height="4" rx="0.6" fill={PAL.ink} opacity="0.7" />
      ))}
      {/* Rear expansion slot covers */}
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x="11" y={64 + i * 5} width="3" height="3.4" rx="0.5" fill={PAL.steel} />
      ))}
      {/* Standoffs the board will land on */}
      {[[16, 30], [16, 80], [58, 30], [58, 80], [37, 30]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.9" fill={PAL.steel} />
      ))}
    </g>
  );
}

/**
 * One part, rendered at whichever pose it currently occupies.
 *
 * The desk pose and the seat rect come from the model; this component only
 * chooses between them and lets the CSS transition carry the part across. That
 * is the whole of "animate into the case".
 */
function PartOnBench({
  def,
  seated,
  held,
  hovered,
  blocked,
  onEnter,
  onLeave,
  onClick,
}: {
  def: PartDef;
  seated: boolean;
  held: boolean;
  hovered: boolean;
  blocked: string | null;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const Vector = PART_VECTOR[def.id];
  if (!Vector) return null;

  // Desk parts are drawn at a fixed footprint; seated ones take the slot's.
  const deskW = 15;
  const deskH = 15;
  /*
   * CSS transform syntax, NOT the SVG attribute's.
   *
   * These are applied through `style` so they can transition, and CSS demands
   * units and commas — `translate(50 88)` is valid as an SVG attribute and
   * INVALID as CSS, where it is dropped silently. Dropped transforms rendered
   * every part at its full 100-unit size across the whole board. On an SVG
   * element `px` resolves to user units, so the numbers still mean desk space.
   */
  const t = seated
    ? `translate(${def.seat.x}px, ${def.seat.y}px) scale(${def.seat.w / 100}, ${def.seat.h / 100}) rotate(${def.seat.rot ?? 0}deg)`
    : `translate(${def.desk.x - deskW / 2}px, ${def.desk.y - deskH / 2}px) scale(${deskW / 100}, ${deskH / 100}) rotate(${def.desk.rot}deg)`;

  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={seated ? "" : blocked ? "cursor-not-allowed" : "cursor-pointer"}
      style={{
        transform: t,
        // Rotation must pivot on the part's own centre, not the canvas origin.
        transformOrigin: "50px 50px",
        // The interpolation that carries a part from desk to socket.
        transition: "transform 460ms cubic-bezier(0.34, 1.24, 0.4, 1), opacity 200ms",
        opacity: blocked && !seated ? 0.55 : 1,
        filter: seated ? undefined : "url(#ds-lift)",
      }}
    >
      <Vector installed={seated} highlighted={!seated && (held || hovered) && !blocked} />
    </g>
  );
}
