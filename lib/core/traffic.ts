/**
 * TriageOS — Video traffic, the NVR, and bandwidth saturation (Builds 2 & 3)
 * ==========================================================================
 * Cameras generate load. The NVR collects it. Somewhere between the two is a
 * link with a finite capacity, and when the first exceeds the last, everything
 * else on that link suffers — which is the entire point of the exercise.
 *
 * ── WHAT IS STORED ──────────────────────────────────────────────────────────
 *
 * Three things, and nothing that can be computed from them:
 *
 *   - each camera's VIDEO PROFILE (resolution and frame rate), as a profile id
 *   - the NVR: which node it is, how many channels it can take, its capacity
 *   - LINK CAPACITY: the switch uplink and the backbone, in Mbps
 *
 * ── WHAT IS DERIVED ─────────────────────────────────────────────────────────
 *
 * Everything anyone actually looks at:
 *
 *   - whether a given camera is streaming AT ALL
 *   - its offered bitrate
 *   - the load on each switch uplink and on the backbone
 *   - the saturation level
 *   - the latency and loss every node on a congested path experiences
 *   - the estate's health score
 *
 * A stored `currentMbps` would be a second copy of a number that the ports,
 * the leases and the power budget already determine between them. It would go
 * stale the first time a port was disabled through a path that forgot to
 * recompute it, and the operator would be looking at a bandwidth chart that
 * disagreed with the switch it was drawn from.
 *
 * ── THE THREE CONDITIONS FOR A STREAM ───────────────────────────────────────
 *
 * A camera transmits only when all three hold:
 *
 *   1. IT HAS POWER. PoE-live, per Build 1 — a shed camera sends nothing, and
 *      that is precisely why shedding is a way to RELIEVE congestion.
 *   2. IT HAS A VALID ADDRESS. A camera in an IP conflict cannot reliably
 *      reach anything, so it contributes no sustained load.
 *   3. THE NVR IS REACHABLE. A stream with no recorder is not a stream.
 *
 * All three are the same facts other screens already read, which is what makes
 * "unplug the camera and watch the backbone drop" work without a single event
 * handler wiring the two together.
 */

import type { NodeId } from "./nodes";
import type { InfrastructureState, TargetNode } from "./infrastructure";
import { poeLiveness } from "./poe";
import { detectConflicts, effectiveIp, subnetOf, type IpConflict } from "./ipam";

// ── Video profiles ──────────────────────────────────────────────────────────

/**
 * Bitrates are the sustained H.264 figures these formats actually produce, not
 * headline maxima: a 1080p25 camera on a busy scene sits around 4 Mbps, and a
 * 4K camera around four times that. The numbers matter because the whole
 * lesson is arithmetic the player can do in their head — eight cameras at
 * 4 Mbps is 32, and a 100 Mbps uplink shared with the servers is fine until
 * somebody swaps them all for 4K.
 */
export type VideoProfileId = "720p" | "1080p" | "1080p-high" | "4k";

export const VIDEO_PROFILES: Record<
  VideoProfileId,
  { label: string; mbps: number; note: string }
> = {
  "720p": { label: "720p · 15fps", mbps: 2, note: "Corridor and door cameras." },
  "1080p": { label: "1080p · 25fps", mbps: 4, note: "The default for most fixed cameras." },
  "1080p-high": { label: "1080p · 30fps high", mbps: 6, note: "Busy scenes with a lot of motion." },
  "4k": { label: "4K · 25fps", mbps: 16, note: "Number-plate and face capture. Expensive." },
};

export const DEFAULT_PROFILE: VideoProfileId = "1080p";

// ── Persisted state ─────────────────────────────────────────────────────────

export interface NvrState {
  /** The node that IS the recorder. One join, as everywhere else. */
  nodeId: NodeId;
  name: string;
  /** How many camera streams it can take at once. */
  channels: number;
  /** Recording capacity in TB, for the retention readout. */
  storageTb: number;
  /** Days of footage the site is required to keep. */
  retentionDays: number;
}

export interface CameraStreamConfig {
  nodeId: NodeId;
  profile: VideoProfileId;
  /** Recording to the NVR at all. A camera can be live but not recorded. */
  recording: boolean;
}

export interface TrafficState {
  nvr: NvrState | null;
  /** Per-camera configuration, keyed by node. */
  cameras: Record<NodeId, CameraStreamConfig>;
  /**
   * Capacity of each switch's uplink to the core, in Mbps. Keyed by switch id.
   * A gigabit access switch on a 100 Mbps uplink is a real and very common
   * mistake, so the two are separate numbers.
   */
  uplinkMbps: Record<string, number>;
  /** The core backbone everything shares. */
  backboneMbps: number;
  /**
   * Non-video load the estate carries anyway — file shares, backups, staff
   * browsing. Stored as a baseline rather than simulated, because the lesson
   * is about the video on top of it, not about modelling office traffic.
   */
  baselineMbps: number;
}

export function createTrafficState(): TrafficState {
  return {
    nvr: null,
    cameras: {},
    uplinkMbps: {},
    backboneMbps: 1000,
    baselineMbps: 0,
  };
}

// ── Debug overrides (Dev Tools) ─────────────────────────────────────────────

/**
 * Session-scoped test overrides.
 *
 * DELIBERATELY NOT PART OF `InfrastructureState`. A stress test is something
 * the developer is doing right now, not a fact about the world — persisting it
 * would put "cameras forced to 50 Mbps" into a save file and have a player
 * reopen a game that is inexplicably on fire. Passed into the derivation
 * instead, so the same pure function serves both the game and the bench.
 */
export interface TrafficOverrides {
  /** Multiplier on every camera's bitrate. 1 = off. */
  stressMultiplier?: number;
  /** Force every camera to this exact bitrate, ignoring its profile. */
  forceMbpsPerCamera?: number | null;
  /** Pin the network to saturated, or pin it clear, regardless of the maths. */
  forceState?: SaturationLevel | null;
}

// ── Derivation ──────────────────────────────────────────────────────────────

export type SaturationLevel = "clear" | "busy" | "congested" | "saturated";

/**
 * Where each level begins, as a fraction of capacity.
 *
 * `busy` starts at 70% because that is where a real network stops being
 * comfortable and starts being something you watch. `saturated` at 100% rather
 * than 95%: below capacity the switch is coping, and calling that "saturated"
 * would teach the player to panic at a number that is fine.
 */
export const SATURATION_THRESHOLDS: Record<Exclude<SaturationLevel, "clear">, number> = {
  busy: 0.7,
  congested: 0.9,
  saturated: 1.0,
};

export function levelFor(loadPct: number): SaturationLevel {
  const f = loadPct / 100;
  if (f >= SATURATION_THRESHOLDS.saturated) return "saturated";
  if (f >= SATURATION_THRESHOLDS.congested) return "congested";
  if (f >= SATURATION_THRESHOLDS.busy) return "busy";
  return "clear";
}

export const SATURATION_META: Record<
  SaturationLevel,
  { label: string; tone: "ok" | "warn" | "bad" }
> = {
  clear: { label: "Clear", tone: "ok" },
  busy: { label: "Busy", tone: "ok" },
  congested: { label: "Congested", tone: "warn" },
  saturated: { label: "Saturated", tone: "bad" },
};

export interface CameraLoad {
  nodeId: NodeId;
  hostname: string;
  /** What it would send if everything were working. */
  ratedMbps: number;
  /** What it is actually sending. Zero when any of the three gates fails. */
  mbps: number;
  streaming: boolean;
  /** Why it is not streaming, in the operator's language. Null when it is. */
  blockedBy: string | null;
  /** Which switch and port it hangs off, when it is patched in. */
  switchId?: string;
  port?: number;
}

export interface SegmentLoad {
  id: string;
  label: string;
  capacityMbps: number;
  offeredMbps: number;
  loadPct: number;
  level: SaturationLevel;
}

export interface TrafficReport {
  cameras: CameraLoad[];
  /** Video load only, aggregated. */
  videoMbps: number;
  /** Video plus the office baseline. */
  totalMbps: number;
  /** One entry per switch uplink. */
  uplinks: SegmentLoad[];
  backbone: SegmentLoad;
  /** The worst level anywhere on the path — what the estate actually feels. */
  level: SaturationLevel;
  /** Streams the NVR has had to refuse for want of channels. */
  overChannels: number;
  /** True when an override is pinning the state rather than the maths. */
  forced: boolean;
}

/** Is this node an IP camera? Role, not tags — tags are cosmetic. */
export function isCamera(node: TargetNode): boolean {
  return node.role === "ip-camera";
}

export function isNvr(node: TargetNode): boolean {
  return node.role === "nvr";
}

/**
 * The full traffic picture.
 *
 * One pass over the cameras, then one aggregation per segment. Pure, so the
 * Dev Tools bench and the live game call exactly the same code — a stress test
 * that ran through a different path would be testing the wrong thing.
 */
export function computeTraffic(
  infra: InfrastructureState,
  overrides: TrafficOverrides = {},
): TrafficReport {
  const traffic = infra.traffic ?? createTrafficState();
  const conflicts = detectConflicts({
    nodes: infra.nodes,
    subnets: infra.subnets,
    ipam: infra.ipam,
  });
  const blocking = new Set(conflicts.filter((c) => c.blocking).map((c) => c.nodeId));

  // The recorder has to be up before any stream counts. Checked once rather
  // than per camera, because it is one fact about the estate.
  const nvrNode = traffic.nvr ? infra.nodes[traffic.nvr.nodeId] : undefined;
  const nvrDown = nvrReason(infra, nvrNode, blocking);

  const cameras: CameraLoad[] = [];
  let admitted = 0;
  let overChannels = 0;

  for (const node of Object.values(infra.nodes)) {
    if (!isCamera(node)) continue;

    const cfg = traffic.cameras[node.nodeId];
    const profile = cfg?.profile ?? DEFAULT_PROFILE;
    const base = VIDEO_PROFILES[profile]?.mbps ?? VIDEO_PROFILES[DEFAULT_PROFILE].mbps;
    const rated =
      overrides.forceMbpsPerCamera != null
        ? overrides.forceMbpsPerCamera
        : base * (overrides.stressMultiplier ?? 1);

    const at = portOf(infra, node.nodeId);
    const poe = poeLiveness(infra.poe, node.nodeId, infra.nodes);

    let blockedBy: string | null = null;
    if (!poe.live) blockedBy = poe.reason;
    else if (blocking.has(node.nodeId)) blockedBy = "Address conflict — the stream cannot be delivered reliably.";
    else if (cfg && !cfg.recording) blockedBy = "Recording is switched off for this camera.";
    else if (nvrDown) blockedBy = nvrDown;

    // CHANNEL LIMIT. Admitted in node order so the answer is stable; a camera
    // refused for want of a channel is a real and very confusing outage, and
    // it should always be the same camera until the operator changes something.
    if (!blockedBy && traffic.nvr && admitted >= traffic.nvr.channels) {
      blockedBy = `${traffic.nvr.name} has no free channel — it takes ${traffic.nvr.channels}.`;
      overChannels += 1;
    }

    const streaming = !blockedBy;
    if (streaming) admitted += 1;

    cameras.push({
      nodeId: node.nodeId,
      hostname: node.hostname,
      ratedMbps: rated,
      mbps: streaming ? rated : 0,
      streaming,
      blockedBy,
      switchId: at?.switchId,
      port: at?.port,
    });
  }

  const videoMbps = round1(cameras.reduce((n, c) => n + c.mbps, 0));
  const totalMbps = round1(videoMbps + traffic.baselineMbps);

  /*
   * PER-UPLINK LOAD. Only the cameras on THAT switch count toward its uplink —
   * which is what makes moving cameras between switches a real remedy, and
   * what makes a single overloaded access switch degrade its own segment
   * without taking down the whole site.
   */
  const uplinks: SegmentLoad[] = (infra.poe?.switches ?? []).map((sw) => {
    const onSwitch = cameras
      .filter((c) => c.switchId === sw.id)
      .reduce((n, c) => n + c.mbps, 0);
    const capacity = traffic.uplinkMbps[sw.id] ?? 1000;
    return segment(sw.id, `${sw.name} uplink`, capacity, onSwitch);
  });

  const backbone = segment("backbone", "Core backbone", traffic.backboneMbps, totalMbps);

  // The estate feels the WORST segment on the path, not the average. An uplink
  // at 140% is an outage for everything behind it even if the backbone is idle.
  const worst = [backbone, ...uplinks].reduce(
    (acc, s) => (rank(s.level) > rank(acc.level) ? s : acc),
    backbone,
  );

  const forced = overrides.forceState != null;

  return {
    cameras,
    videoMbps,
    totalMbps,
    uplinks,
    backbone,
    level: forced ? overrides.forceState! : worst.level,
    overChannels,
    forced,
  };
}

function segment(
  id: string,
  label: string,
  capacityMbps: number,
  offeredMbps: number,
): SegmentLoad {
  const loadPct = capacityMbps > 0 ? (offeredMbps / capacityMbps) * 100 : 0;
  return {
    id,
    label,
    capacityMbps,
    offeredMbps: round1(offeredMbps),
    loadPct: round1(loadPct),
    level: levelFor(loadPct),
  };
}

const ORDER: SaturationLevel[] = ["clear", "busy", "congested", "saturated"];
function rank(l: SaturationLevel): number {
  return ORDER.indexOf(l);
}

/** Why the recorder is not accepting streams, or null when it is. */
function nvrReason(
  infra: InfrastructureState,
  nvrNode: TargetNode | undefined,
  blocking: Set<NodeId>,
): string | null {
  const traffic = infra.traffic;
  if (!traffic?.nvr) return "No recorder on this estate — nothing is being recorded.";
  if (!nvrNode) return `${traffic.nvr.name} is not in the estate.`;
  if (!nvrNode.connection.online) return `${traffic.nvr.name} is powered off.`;
  const poe = poeLiveness(infra.poe, nvrNode.nodeId, infra.nodes);
  if (!poe.live) return poe.reason;
  if (blocking.has(nvrNode.nodeId)) return `${traffic.nvr.name} has an address conflict.`;
  if (infra.security.isolatedNodeIds.includes(nvrNode.nodeId)) {
    return `${traffic.nvr.name} is isolated by an active containment.`;
  }
  return null;
}

function portOf(
  infra: InfrastructureState,
  nodeId: NodeId,
): { switchId: string; port: number } | undefined {
  for (const sw of infra.poe?.switches ?? []) {
    const p = sw.ports.find((x) => x.attachedNodeId === nodeId);
    if (p) return { switchId: sw.id, port: p.n };
  }
  return undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── What saturation DOES ────────────────────────────────────────────────────

/**
 * The penalty each level imposes.
 *
 * Latency is a MULTIPLIER rather than an addition because that is how queueing
 * actually behaves — a link at 95% does not add a flat 40ms, it multiplies
 * whatever the round trip already was. A 2ms LAN hop becoming 12ms and a 40ms
 * WAN hop becoming 240ms from the same congestion is exactly right, and it is
 * why the WAN link is always the one people notice first.
 *
 * Loss is additive, because dropped frames come from a full queue rather than
 * from a slow one, and it starts at zero until the link is genuinely over.
 */
export const SATURATION_PENALTY: Record<
  SaturationLevel,
  { latencyFactor: number; addedLossPct: number; healthPenalty: number; frameDelayMs: number }
> = {
  clear: { latencyFactor: 1, addedLossPct: 0, healthPenalty: 0, frameDelayMs: 0 },
  busy: { latencyFactor: 1.6, addedLossPct: 0, healthPenalty: 2, frameDelayMs: 0 },
  congested: { latencyFactor: 4, addedLossPct: 2.5, healthPenalty: 12, frameDelayMs: 220 },
  saturated: { latencyFactor: 9, addedLossPct: 9, healthPenalty: 30, frameDelayMs: 650 },
};

/**
 * The latency a node actually shows while the network is in this state.
 *
 * DERIVED, never written onto the node. Writing an inflated latency into
 * `connection.latencyMs` would mean unwinding it when congestion cleared, and
 * the first path that forgot would leave a permanently slow server that no
 * amount of fixing the network would repair.
 */
export function effectiveLatency(baseMs: number, level: SaturationLevel): number {
  return Math.round(baseMs * SATURATION_PENALTY[level].latencyFactor * 10) / 10;
}

export function effectiveLossPct(baseLossPct: number, level: SaturationLevel): number {
  return Math.min(100, Math.round((baseLossPct + SATURATION_PENALTY[level].addedLossPct) * 10) / 10);
}

/**
 * A single health score for the estate, 0-100.
 *
 * Congestion is only one of the things that can be wrong, so it takes points
 * off rather than setting the number: an estate with a dead server AND a
 * saturated backbone should score worse than one with either alone.
 */
export function estateHealth(infra: InfrastructureState, report: TrafficReport): {
  score: number;
  level: SaturationLevel;
  notes: string[];
} {
  const notes: string[] = [];
  let score = 100;

  const penalty = SATURATION_PENALTY[report.level].healthPenalty;
  if (penalty > 0) {
    score -= penalty;
    notes.push(
      `Network ${SATURATION_META[report.level].label.toLowerCase()} — ${report.totalMbps} Mbps offered.`,
    );
  }

  const nodes = Object.values(infra.nodes);
  const down = nodes.filter((n) => !n.connection.online || !n.connection.reachable).length;
  if (down > 0) {
    score -= Math.min(30, down * 6);
    notes.push(`${down} host${down === 1 ? "" : "s"} unreachable.`);
  }

  const critical = nodes.filter((n) => n.health.status === "critical").length;
  if (critical > 0) {
    score -= Math.min(25, critical * 8);
    notes.push(`${critical} host${critical === 1 ? "" : "s"} critical.`);
  }

  const dark = report.cameras.filter((c) => !c.streaming).length;
  if (dark > 0) {
    score -= Math.min(15, dark * 3);
    notes.push(`${dark} camera${dark === 1 ? "" : "s"} not recording.`);
  }

  return { score: Math.max(0, Math.round(score)), level: report.level, notes };
}

/** Conflicts helper re-exported for callers that already have a report. */
export function blockingIds(conflicts: IpConflict[]): Set<NodeId> {
  return new Set(conflicts.filter((c) => c.blocking).map((c) => c.nodeId));
}
