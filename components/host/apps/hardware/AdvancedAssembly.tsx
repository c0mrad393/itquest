"use client";

/**
 * AdvancedAssembly — hyper-realistic teardown & assembly (v2)
 * ===========================================================
 * Device-specific, multi-phase physical work:
 *   laptop → disconnect battery · tiny screw grid · reconnect battery
 *   server → extract tray · remove baffle · cable the backplane · reinstall
 *   desktop→ swap component · route power/data cables · fasten screws
 * Skipping screws / battery / cables sets a fault the OS install will trip on
 * ("Hardware Interrupt/Power Error").
 */

import { useEffect, useRef, useState } from "react";
import type { AssemblySpec } from "@/lib/hardware/types";
import { COMPONENT_CATEGORY, componentLabel } from "@/lib/hardware/types";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { availableOf, incompatibilityReason, specLine } from "@/lib/core";
import type { AssetItem } from "@/lib/core";
import { playCue } from "@/lib/audio/engine";
import { AppIcon } from "@/components/ui/app-icons";

type Phase = "prep" | "swap" | "cabling" | "fasten" | "close" | "ready";

export default function AdvancedAssembly({
  spec,
  onComplete,
}: {
  spec: AssemblySpec;
  onComplete: (result: { faulty: boolean; fault?: string }) => void;
}) {
  const needsPrep = spec.battery || spec.baffle;
  const [phase, setPhase] = useState<Phase>(needsPrep ? "prep" : "swap");

  // prep
  const [batteryOff, setBatteryOff] = useState(!spec.battery);
  const [trayOut, setTrayOut] = useState(spec.archetype !== "server");
  const [baffleOff, setBaffleOff] = useState(!spec.baffle);
  // swap
  const [extracted, setExtracted] = useState(false);
  const [installed, setInstalled] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  // cabling
  const [cablesDone, setCablesDone] = useState(0);
  // fasten
  const [screwsDone, setScrewsDone] = useState(0);
  // close
  const [batteryOn, setBatteryOn] = useState(!spec.battery);
  const [baffleOn, setBaffleOn] = useState(!spec.baffle);

  const inventory = useInfraStore((st) => st.infra.inventory);
  const consumePart = useInfraStore((st) => st.consumePart);
  const markFaulty = useInfraStore((st) => st.markFaulty);
  const openApp = useHostStore((st) => st.openApp);
  const [outOfStock, setOutOfStock] = useState<string | null>(null);
  const [reject, setReject] = useState<string | null>(null);

  // Real catalogue lines for this component class — brands, specs, live stock.
  const stock = inventory.items.filter((i) => i.category === COMPONENT_CATEGORY[spec.defective]);

  const prepDone = batteryOff && trayOut && baffleOff;
  const swapDone = extracted && installed >= spec.count;
  const cablingDone = cablesDone >= spec.cabling.length;
  const fastenDone = screwsDone >= spec.screws;
  const closeDone = batteryOn && baffleOn;

  /**
   * Pull the dead part. It does not vanish — it is booked back into the asset
   * register as Faulty, because the company still owns it and still has to
   * account for it.
   */
  function extractDefective() {
    if (extracted) return;
    setExtracted(true);
    if (spec.defectiveSkuId) markFaulty(spec.defectiveSkuId, spec.count);
  }

  function pickStock(item: AssetItem) {
    if (!extracted || installed >= spec.count) return;

    // Compatibility first: the traits must satisfy the job's requirement.
    // This is where buying DDR4 for a DDR5 board is felt — the part is on the
    // shelf, it cost budget, and it still will not go in.
    const why = incompatibilityReason(item.traits, spec.requirement);
    if (why) {
      setWrong(item.id);
      setReject(why);
      playCue("error");
      setTimeout(() => setWrong(null), 900);
      return;
    }

    // Then availability. consumePart is the authority: it takes the unit off
    // the shelf and refuses when the shelf is empty.
    if (!consumePart(item.id)) {
      setOutOfStock(item.id);
      playCue("error");
      setTimeout(() => setOutOfStock(null), 2400);
      return;
    }
    setInstalled((n) => n + 1);
    setWrong(null);
    setReject(null);
  }

  function proceed() {
    // Fault logic: anything left incomplete = a power/interrupt fault later.
    let fault: string | undefined;
    if (!fastenDone) fault = "chassis screws not fastened — board is loose";
    else if (spec.battery && !batteryOn) fault = "battery ribbon was not reconnected";
    else if (!cablingDone) fault = "internal power/data cable not seated";
    onComplete({ faulty: !!fault, fault });
  }

  return (
    <div className="grid grid-cols-[1fr_240px] gap-4">
      {/* Blueprint */}
      <div
        className="rounded-xl border border-info/20 bg-[#071018] p-4"
        style={{ backgroundImage: "linear-gradient(rgba(56,189,248,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.06) 1px,transparent 1px)", backgroundSize: "20px 20px" }}
      >
        <div className="mb-3 flex items-center justify-between text-[11px] text-info/80">
          <span className="uppercase tracking-wider">
            {spec.archetype === "server" ? "STORAGE RACK TRAY" : spec.archetype === "laptop" ? "LAPTOP · BOTTOM COVER" : "WORKSTATION MAINBOARD"}
          </span>
          <span className="font-mono">{spec.count > 1 ? `${spec.count}× ${spec.replacementLabel}` : spec.replacementLabel}</span>
        </div>

        {/* PREP gates */}
        {phase === "prep" && (
          <div className="space-y-2">
            {spec.archetype === "server" && (
              <>
                <GateBtn done={trayOut} label="Slide out the rack tray" onClick={() => setTrayOut(true)} />
                <GateBtn done={baffleOff} label="Remove the air baffle" onClick={() => setBaffleOff(true)} disabled={!trayOut} />
              </>
            )}
            {spec.battery && (
              <GateBtn done={batteryOff} label="Disconnect the battery ribbon (safety)" onClick={() => setBatteryOff(true)} danger />
            )}
            <ProceedInline enabled={prepDone} label="Open chassis →" onClick={() => setPhase("swap")} />
          </div>
        )}

        {/* SWAP */}
        {phase === "swap" && (
          <div>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              {Array.from({ length: Math.max(2, spec.count + 1) }).map((_, i) => {
                if (i === 0) {
                  return (
                    <Slot key="def" state={installed > 0 && spec.count === 1 ? "filled" : extracted ? "empty" : "defective"} onExtract={extractDefective} label={installed > 0 && spec.count === 1 ? spec.replacementLabel : `${componentLabel(spec.defective)} · FAULT`} />
                  );
                }
                if (i <= installed && spec.count > 1) return <Slot key={i} state="filled" onExtract={() => {}} label={spec.replacementLabel} />;
                if (i <= spec.count) return <div key={i} className="h-9 rounded-md border-2 border-dashed border-amber-400/40 text-center text-[10px] leading-8 text-amber-300/60">{extracted ? "install →" : "slot"}</div>;
                return <div key={i} className="h-9 rounded-md border border-edge/60 bg-gray-500/[0.08] text-center text-[10px] leading-9 text-gray-600">OK</div>;
              })}
            </div>
            <StatusLine>
              {swapDone ? <span className="text-emerald-400">✓ Component(s) seated.</span>
                : extracted ? <span className="text-amber-300">Pick {spec.count > 1 ? `${spec.count - installed} more` : "the"} replacement from Stock →</span>
                : <span className="text-danger">⚠ Click the flashing red part to extract.</span>}
            </StatusLine>
            <ProceedInline enabled={swapDone} label={spec.cabling.length ? "Route cables →" : "Fasten chassis →"} onClick={() => setPhase(spec.cabling.length ? "cabling" : "fasten")} />
          </div>
        )}

        {/* CABLING */}
        {phase === "cabling" && (
          <CablingBoard routes={spec.cabling} done={cablesDone} onRoute={() => setCablesDone((n) => n + 1)} onNext={() => setPhase("fasten")} nextEnabled={cablingDone} />
        )}

        {/* FASTEN */}
        {phase === "fasten" && (
          <div>
            <div className="mb-1 text-[11px] text-gray-400">Hold each screw point to drive it in ({screwsDone}/{spec.screws}):</div>
            <div className={`grid ${spec.archetype === "laptop" ? "grid-cols-6" : "grid-cols-4"} gap-3 py-2`}>
              {Array.from({ length: spec.screws }).map((_, i) => (
                <ScrewPoint key={i} onDone={() => setScrewsDone((n) => n + 1)} />
              ))}
            </div>
            <ProceedInline enabled={true} label={spec.battery || spec.baffle ? "Close up →" : "Finish assembly"} onClick={() => (spec.battery || spec.baffle ? setPhase("close") : proceed())} />
            {!fastenDone && <div className="mt-1 text-[10px] text-amber-300/70">Proceeding with loose screws will power-fault during imaging.</div>}
          </div>
        )}

        {/* CLOSE */}
        {phase === "close" && (
          <div className="space-y-2">
            {spec.baffle && <GateBtn done={baffleOn} label="Reinstall the air baffle" onClick={() => setBaffleOn(true)} />}
            {spec.battery && <GateBtn done={batteryOn} label="Reconnect the battery ribbon" onClick={() => setBatteryOn(true)} danger />}
            <ProceedInline enabled={true} label="Finish assembly" onClick={proceed} />
            {!closeDone && <div className="text-[10px] text-amber-300/70">Skipping the battery reconnect will cause a power error at boot.</div>}
          </div>
        )}
      </div>

      {/* Stock inventory + checklist */}
      <div className="space-y-3">
        <div className="rounded-xl border border-edge bg-panelalt/40 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Stock Inventory</div>
          <div className="space-y-2">
            {stock.map((item) => {
              const have = availableOf(item);
              const fits = !incompatibilityReason(item.traits, spec.requirement);
              return (
                <button key={item.id} onClick={() => pickStock(item)} disabled={phase !== "swap" || !extracted || installed >= spec.count || have === 0}
                  title={have === 0 ? "Out of stock — order more in Procurement" : `${have} on the shelf`}
                  className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition disabled:opacity-40 ${wrong === item.id ? "border-danger bg-danger/10" : have === 0 ? "border-edge/50" : "border-edge hover:border-info/50 hover:bg-info/5"}`}>
                  <AppIcon id="package" size={17} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-gray-100">{item.name}</span>
                    <span className="block truncate font-mono text-[9px] text-gray-500">{specLine(item)}</span>
                  </span>
                  {have > 0 && !fits && (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300" title="Specification mismatch">
                      spec
                    </span>
                  )}
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${have === 0 ? "bg-danger/20 text-danger" : "bg-gray-500/10 text-gray-400"}`}>
                    {have === 0 ? "none" : `${have} left`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[9px] text-gray-600">Required: {spec.count > 1 ? `${spec.count}× ` : ""}{spec.replacementLabel}</div>
          {reject && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
              <span className="mt-px shrink-0"><AppIcon id="alert" size={11} /></span>
              <span className="min-w-0">{reject}</span>
            </div>
          )}
          {outOfStock && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-[10px] text-danger">
              <AppIcon id="alert" size={11} />
              <span className="min-w-0 flex-1">Store room is out of this part.</span>
              <button onClick={() => openApp("procurement")} className="shrink-0 rounded border border-danger/40 px-1.5 py-0.5 font-semibold hover:bg-danger/15">
                Order
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-edge bg-panelalt/40 p-3 text-[11px]">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Teardown checklist</div>
          {(spec.battery || spec.baffle) && <Check ok={prepDone}>Prep / safety</Check>}
          <Check ok={swapDone}>Component swap</Check>
          {spec.cabling.length > 0 && <Check ok={cablingDone}>Cabling ({cablesDone}/{spec.cabling.length})</Check>}
          <Check ok={fastenDone}>Screws ({screwsDone}/{spec.screws})</Check>
          {(spec.battery || spec.baffle) && <Check ok={closeDone}>Reassembly</Check>}
        </div>
      </div>
    </div>
  );
}

// ── Screwing mechanic (hold to drive, circular fill) ─────────────────────────

function ScrewPoint({ onDone }: { onDone: () => void }) {
  const [prog, setProg] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);
  const done = prog >= 100;

  useEffect(() => {
    if (prog >= 100 && !fired.current) { fired.current = true; onDone(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog]);

  function advance(amount: number) {
    setProg((p) => Math.min(100, p + amount));
  }
  // Hold = continuous drive; each discrete click = one ratchet turn.
  function startHold() { if (done) return; timer.current = setInterval(() => advance(6), 45); }
  function stopHold() { if (timer.current) { clearInterval(timer.current); timer.current = null; } }
  function turn() { if (!done) advance(34); }

  return (
    <button
      onMouseDown={startHold} onMouseUp={stopHold} onMouseLeave={stopHold} onClick={turn}
      className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-full transition"
      style={{ background: done ? "#14532d" : `conic-gradient(#4cc2ff ${prog}%, #1b2430 0)` }}
      title="Hold or click to drive"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b1220] text-sm text-gray-300">
        {done ? "✓" : "✚"}
      </span>
    </button>
  );
}

// ── Cabling board (click source → destination) ───────────────────────────────

function CablingBoard({ routes, done, onRoute, onNext, nextEnabled }: {
  routes: { from: string; to: string }[]; done: number; onRoute: () => void; onNext: () => void; nextEnabled: boolean;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState(false);

  function clickPort(port: string, side: "from" | "to") {
    if (side === "from") { setFrom(port); setErr(false); return; }
    if (!from) return;
    const idx = routes.findIndex((r, i) => r.from === from && r.to === port && !connected.has(i));
    if (idx >= 0) {
      const next = new Set(connected); next.add(idx); setConnected(next); setFrom(null); onRoute();
    } else {
      setErr(true); setFrom(null); setTimeout(() => setErr(false), 700);
    }
  }

  return (
    <div>
      <div className="mb-2 text-[11px] text-gray-400">Route each internal cable: click a source port, then its destination.</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase text-gray-500">Source ports</div>
          {routes.map((r) => (
            <button key={r.from} onClick={() => clickPort(r.from, "from")} className={`block w-full rounded border px-2 py-1 text-left text-[11px] ${from === r.from ? "border-info bg-info/15 text-gray-100" : "border-edge text-gray-300 hover:bg-panelalt"}`}>◧ {r.from}</button>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase text-gray-500">Destinations</div>
          {routes.map((r, i) => (
            <button key={r.to} onClick={() => clickPort(r.to, "to")} disabled={connected.has(i)} className={`block w-full rounded border px-2 py-1 text-left text-[11px] disabled:opacity-50 ${connected.has(i) ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : err ? "border-danger" : "border-edge text-gray-300 hover:bg-panelalt"}`}>{connected.has(i) ? "✓ " : "◨ "}{r.to}</button>
          ))}
        </div>
      </div>
      {err && <div className="mt-2 text-[10px] text-danger">Ports don&apos;t match — check the cable routing.</div>}
      <StatusLine>{done >= routes.length ? <span className="text-emerald-400">✓ All cables routed.</span> : <span className="text-amber-300">{done}/{routes.length} cables connected.</span>}</StatusLine>
      <ProceedInline enabled={nextEnabled} label="Fasten chassis →" onClick={onNext} />
    </div>
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function Slot({ state, onExtract, label }: { state: "defective" | "empty" | "filled"; onExtract: () => void; label: string }) {
  if (state === "defective") return <button onClick={onExtract} className="h-9 animate-pulse rounded-md border border-danger bg-danger/25 text-center text-[10px] font-semibold leading-9 text-danger">{label} · EXTRACT</button>;
  if (state === "empty") return <div className="h-9 rounded-md border-2 border-dashed border-amber-400/50 text-center text-[10px] leading-8 text-amber-300/70">empty slot</div>;
  return <div className="h-9 rounded-md border border-emerald-500/50 bg-emerald-500/15 text-center text-[10px] font-semibold leading-9 text-emerald-300">{label} ✓</div>;
}

function GateBtn({ done, label, onClick, disabled, danger }: { done: boolean; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={done || disabled} className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px] transition disabled:cursor-default ${done ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : danger ? "border-danger/50 text-danger hover:bg-danger/10" : "border-edge text-gray-200 hover:bg-panelalt"}`}>
      <span>{done ? "✓" : "○"}</span> {label}
    </button>
  );
}

function ProceedInline({ enabled, label, onClick }: { enabled: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} disabled={!enabled} className="mt-3 rounded-md bg-brand-fill px-3 py-1.5 text-xs font-semibold text-brand-on transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500">{label}</button>;
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 text-[11px]">{children}</div>;
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 py-0.5"><span className={ok ? "text-emerald-400" : "text-gray-600"}>{ok ? "✓" : "○"}</span><span className={ok ? "text-gray-200" : "text-gray-400"}>{children}</span></div>;
}
