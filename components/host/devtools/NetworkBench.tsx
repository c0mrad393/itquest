"use client";

/**
 * DevTools — network stress bench (Build 3)
 * =========================================
 * The tab that makes bandwidth saturation testable in seconds rather than by
 * patching in twenty cameras by hand.
 *
 * ── WHY THE OVERRIDES ARE MULTIPLIERS, NOT A STATE SETTER ───────────────────
 *
 * The obvious build is a button that sets `saturated = true`. That is here, as
 * "Instant congestion", because sometimes you genuinely just want the downstream
 * UI in that state to look at it. But it is the SECOND tool, not the first.
 *
 * The first is the bitrate slider, and it is better because it drives the real
 * arithmetic: raise the per-camera rate and the uplink meter climbs, the level
 * changes at the thresholds the game actually uses, and the cameras that stop
 * streaming are the ones the channel limit and the power budget really would
 * have dropped. A forced flag proves the UI can render a state; the slider
 * proves the MODEL reaches it. Those are different claims, and only the second
 * one catches a threshold that has drifted.
 *
 * The forced state is always labelled as forced wherever it is displayed, so a
 * pinned readout is never mistaken for a measurement.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useDevToolsStore, useTrafficOverrides } from "@/lib/host/devtools";
import {
  SATURATION_META,
  VIDEO_PROFILES,
  computeTraffic,
  estateHealth,
  type SaturationLevel,
  type SegmentLoad,
} from "@/lib/core";
import { IconActivity, IconAlert, IconBolt, IconPlus, IconX } from "@/components/ui/icons";

const LEVELS: SaturationLevel[] = ["clear", "busy", "congested", "saturated"];

export default function NetworkBench({ say }: { say: (s: string) => void }) {
  const infra = useInfraStore((s) => s.infra);
  const overrides = useTrafficOverrides();
  const dev = useDevToolsStore();

  const report = useMemo(() => computeTraffic(infra, overrides), [infra, overrides]);
  const health = useMemo(() => estateHealth(infra, report), [infra, report]);

  return (
    <div className="space-y-3">
      {/* ── Live readout ─────────────────────────────────────────────────── */}
      <section>
        <Head>Bandwidth debugger</Head>

        <div className="mb-1.5 flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              report.level === "saturated"
                ? "bg-danger/20 text-danger-strong"
                : report.level === "congested"
                  ? "bg-warn/20 text-warn-strong"
                  : "bg-accent/20 text-accent-strong"
            }`}
          >
            {SATURATION_META[report.level].label}
          </span>
          {report.forced && (
            <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warn-strong">
              forced
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-gray-400">
            health {health.score}/100
          </span>
        </div>

        <Bar seg={report.backbone} />
        {report.uplinks.map((u) => (
          <Bar key={u.id} seg={u} />
        ))}

        <div className="mt-1.5 grid grid-cols-3 gap-1.5 font-mono text-[9px] text-gray-400">
          <Cell label="video" value={`${report.videoMbps} Mb`} />
          <Cell label="total" value={`${report.totalMbps} Mb`} />
          <Cell
            label="streams"
            value={`${report.cameras.filter((c) => c.streaming).length}/${report.cameras.length}`}
          />
        </div>
      </section>

      {/* ── Per-camera contribution ──────────────────────────────────────── */}
      {report.cameras.length > 0 && (
        <section>
          <Head>Per-camera</Head>
          <div className="max-h-32 overflow-y-auto rounded border border-edge">
            {report.cameras.map((c) => (
              <div
                key={c.nodeId}
                className="flex items-baseline gap-1.5 border-b border-edge/40 px-1.5 py-1 last:border-0"
                title={c.blockedBy ?? undefined}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    c.streaming ? "bg-accent" : "bg-gray-600"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-gray-300">
                  {c.hostname}
                  {c.port != null && <span className="text-gray-600"> · p{c.port}</span>}
                </span>
                <span
                  className={`shrink-0 font-mono text-[9px] ${
                    c.streaming ? "text-gray-200" : "text-gray-600"
                  }`}
                >
                  {c.streaming ? `${c.mbps.toFixed(1)} Mb` : "idle"}
                </span>
              </div>
            ))}
          </div>
          {report.overChannels > 0 && (
            <p className="mt-1 flex items-start gap-1 text-[9px] leading-snug text-warn-strong">
              <IconAlert size={9} className="mt-px shrink-0" />
              {report.overChannels} stream{report.overChannels === 1 ? "" : "s"} refused — the
              recorder is out of channels.
            </p>
          )}
        </section>
      )}

      {/* ── Stress ───────────────────────────────────────────────────────── */}
      <section>
        <Head>Traffic stress test</Head>

        <label className="block">
          <span className="mb-0.5 flex items-baseline gap-2 text-[10px] text-gray-400">
            Bitrate multiplier
            <span className="ml-auto font-mono text-gray-200">
              {dev.stressMultiplier.toFixed(1)}x
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={dev.stressMultiplier}
            onChange={(e) => dev.setStress(Number(e.target.value))}
            className="w-full accent-brand-fill"
            aria-label="Camera bitrate multiplier"
          />
          <span className="text-[9px] leading-snug text-gray-500">
            Scales every camera&apos;s real profile. Drives the actual arithmetic, so the level
            changes at the same thresholds the game uses.
          </span>
        </label>

        <div className="mt-2">
          <span className="mb-1 block text-[10px] text-gray-400">
            Force per-camera bitrate
          </span>
          <div className="flex flex-wrap gap-1">
            {[null, 8, 25, 50, 100].map((v) => (
              <button
                key={String(v)}
                onClick={() => {
                  dev.setForceMbps(v);
                  say(v == null ? "bitrate override cleared" : `cameras forced to ${v} Mbps`);
                }}
                className={`rounded border px-1.5 py-0.5 font-mono text-[9px] transition ${
                  dev.forceMbpsPerCamera === v
                    ? "border-brand-fill bg-brand-soft/25 text-brand-text"
                    : "border-edge text-gray-300 hover:bg-gray-500/15"
                }`}
              >
                {v == null ? "off" : `${v} Mb`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pinning ──────────────────────────────────────────────────────── */}
      <section>
        <Head>Instant congestion</Head>
        <div className="flex flex-wrap gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => {
                dev.setForceState(dev.forceState === l ? null : l);
                say(dev.forceState === l ? "state override cleared" : `state pinned to ${l}`);
              }}
              className={`rounded border px-1.5 py-0.5 text-[9px] capitalize transition ${
                dev.forceState === l
                  ? "border-warn bg-warn/20 text-warn-strong"
                  : "border-edge text-gray-300 hover:bg-gray-500/15"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => { dev.reset(); say("all network overrides cleared"); }}
            className="ml-auto rounded border border-edge px-1.5 py-0.5 text-[9px] text-gray-300 hover:bg-gray-500/15"
          >
            <IconX size={9} className="inline" /> Reset all
          </button>
        </div>
        <p className="mt-1 text-[9px] leading-snug text-gray-500">
          Pinning bypasses the maths — useful for looking at the downstream UI, but it proves only
          that the state renders, not that the model can reach it.
        </p>
      </section>

      <Spawner say={say} />
    </div>
  );
}

// ── Segment bar ─────────────────────────────────────────────────────────────

function Bar({ seg }: { seg: SegmentLoad }) {
  const tone =
    seg.level === "saturated"
      ? "bg-danger"
      : seg.level === "congested"
        ? "bg-warn"
        : seg.level === "busy"
          ? "bg-warn-strong"
          : "bg-accent";
  return (
    <div className="mb-1">
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[9px] text-gray-400">{seg.label}</span>
        <span className="shrink-0 font-mono text-[9px] text-gray-300">
          {seg.offeredMbps}/{seg.capacityMbps} Mb
        </span>
        <span
          className={`w-10 shrink-0 text-right font-mono text-[9px] ${
            seg.level === "clear" ? "text-gray-500" : "text-warn-strong"
          }`}
        >
          {Math.round(seg.loadPct)}%
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-500/20">
        {/* Capped at 100% width so an overload does not draw past the track —
            the percentage beside it carries the real number. */}
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.min(100, seg.loadPct)}%` }}
        />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-edge px-1.5 py-1">
      <div className="text-[8px] uppercase tracking-wider text-gray-600">{label}</div>
      <div className="text-gray-200">{value}</div>
    </div>
  );
}

// ── Spawner ─────────────────────────────────────────────────────────────────

/**
 * Instant camera and NVR creation, patched straight into a chosen port.
 *
 * Goes through the SAME store actions the game uses (`devSpawnCamera` →
 * `poeAttach`), so a device spawned here is indistinguishable from a seeded
 * one. A bench that built its own node objects would be able to create devices
 * the real code paths cannot, and the bug it hid would be exactly the one worth
 * finding.
 */
function Spawner({ say }: { say: (s: string) => void }) {
  const infra = useInfraStore((s) => s.infra);
  const spawnCamera = useInfraStore((s) => s.devSpawnCamera);
  const spawnNvr = useInfraStore((s) => s.devSpawnNvr);
  const [switchId, setSwitchId] = useState(infra.poe.switches[0]?.id ?? "");
  const [port, setPort] = useState<number | "auto">("auto");

  const sw = infra.poe.switches.find((s) => s.id === switchId) ?? infra.poe.switches[0];
  const free = sw?.ports.filter((p) => !p.attachedNodeId).map((p) => p.n) ?? [];

  if (!sw) return null;

  return (
    <section>
      <Head>Spawn devices</Head>
      <div className="mb-1.5 flex gap-1">
        <select
          value={switchId || sw.id}
          onChange={(e) => setSwitchId(e.target.value)}
          className="min-w-0 flex-1 rounded border border-edge bg-sunken px-1 py-0.5 text-[9px] text-gray-200"
          aria-label="Switch"
        >
          {infra.poe.switches.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={String(port)}
          onChange={(e) => setPort(e.target.value === "auto" ? "auto" : Number(e.target.value))}
          className="w-24 rounded border border-edge bg-sunken px-1 py-0.5 text-[9px] text-gray-200"
          aria-label="Port"
        >
          <option value="auto">next free</option>
          {free.map((n) => (
            <option key={n} value={n}>port {n}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(VIDEO_PROFILES) as (keyof typeof VIDEO_PROFILES)[]).map((prof) => (
          <button
            key={prof}
            onClick={() => {
              const err = spawnCamera(sw.id, port === "auto" ? null : port, prof);
              say(err ?? `spawned ${VIDEO_PROFILES[prof].label} camera`);
            }}
            disabled={free.length === 0}
            className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-gray-200 hover:bg-gray-500/15 disabled:opacity-40"
          >
            <IconPlus size={9} className="inline" /> {prof}
          </button>
        ))}
        <button
          onClick={() => { const err = spawnNvr(); say(err ?? "spawned a recorder"); }}
          className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-gray-200 hover:bg-gray-500/15"
        >
          <IconPlus size={9} className="inline" /> NVR
        </button>
      </div>
      {free.length === 0 && (
        <p className="mt-1 text-[9px] text-warn-strong">
          {sw.name} has no free ports — pick another switch.
        </p>
      )}
    </section>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
      <IconActivity size={9} /> {children}
    </div>
  );
}
