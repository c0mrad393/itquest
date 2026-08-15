/**
 * TriageOS — Backup policy, storage and recovery (DR build)
 * =========================================================
 * The only part of the estate whose value is invisible until the worst day,
 * which is exactly why it has to be modelled as a decision with a price rather
 * than a checkbox.
 *
 * ── WHAT IS STORED ──────────────────────────────────────────────────────────
 *
 *   - the SCHEDULE for each protected node (off / daily / weekly)
 *   - the purchased STORAGE TIER
 *   - the timestamp of the LAST SUCCESSFUL BACKUP per node
 *   - whether data was permanently lost (the one-way flag — see below)
 *
 * ── WHAT IS DERIVED ─────────────────────────────────────────────────────────
 *
 *   - capacity used and remaining
 *   - each node's safety status
 *   - whether a restore is actually possible RIGHT NOW
 *
 * The last of these is the one that matters. "Can I restore?" is a question
 * with four independent inputs — is there a policy, has it ever run, is there
 * storage, is the storage big enough — and a stored `canRestore` boolean would
 * be a fifth copy of the answer that goes stale the moment any of the four
 * changes. Recomputing it is three comparisons; getting it wrong once during a
 * ransomware incident is the whole game.
 *
 * ── WHY OVER-CAPACITY BREAKS BACKUPS SILENTLY ───────────────────────────────
 *
 * A tier too small for what is protected does not refuse the policy. It lets
 * the operator configure it, shows the capacity bar over the line, and the
 * nodes that do not fit stop getting fresh copies. That is precisely how it
 * fails in real life — the job "succeeds" for a while and the alerting nobody
 * reads is the only warning — and a simulator that refused the configuration
 * outright would teach that the system protects you from this. It does not.
 *
 * SVG icons and typographic glyphs only in anything that renders this — no
 * emoji.
 */

import type { NodeId } from "./nodes";
import type { InfrastructureState, TargetNode } from "./infrastructure";

// ── Storage tiers ───────────────────────────────────────────────────────────

export type StorageTierId = "none" | "nas-2tb" | "nas-8tb" | "array-24tb" | "offsite-96tb";

export interface StorageTier {
  id: StorageTierId;
  label: string;
  capacityGb: number;
  /** One-off cost in credits. */
  priceCr: number;
  /** Offsite copies survive an on-premises encryption event. See below. */
  offsite: boolean;
  blurb: string;
}

/**
 * The catalogue.
 *
 * OFFSITE IS THE ONE THAT MATTERS AND THE ONE THAT COSTS. Ransomware that
 * reaches a NAS on the same network encrypts the backups too — which is how
 * most real recoveries fail — so an on-premises tier can be taken out by the
 * same incident it was bought to survive. The offsite tier cannot. The price
 * gap is the lesson, and a player who buys the cheap one and loses to it has
 * learned something no amount of tooltip could teach.
 */
export const STORAGE_TIERS: StorageTier[] = [
  {
    id: "none",
    label: "No backup storage",
    capacityGb: 0,
    priceCr: 0,
    offsite: false,
    blurb: "Nothing is being kept. A restore is not possible.",
  },
  {
    id: "nas-2tb",
    label: "2 TB NAS",
    capacityGb: 2048,
    priceCr: 600,
    offsite: false,
    blurb: "A box in the server room. Cheap, and on the same network as everything else.",
  },
  {
    id: "nas-8tb",
    label: "8 TB NAS",
    capacityGb: 8192,
    priceCr: 1800,
    offsite: false,
    blurb: "Room for the whole estate. Still on the same network as everything else.",
  },
  {
    id: "array-24tb",
    label: "24 TB backup array",
    capacityGb: 24576,
    priceCr: 4200,
    offsite: false,
    blurb: "Dedicated hardware with real throughput. On premises.",
  },
  {
    id: "offsite-96tb",
    label: "96 TB offsite replication",
    capacityGb: 98304,
    priceCr: 9500,
    offsite: true,
    blurb:
      "Copies leave the building. The only tier an on-premises encryption event cannot reach.",
  },
];

export function tierById(id: StorageTierId): StorageTier {
  return STORAGE_TIERS.find((t) => t.id === id) ?? STORAGE_TIERS[0];
}

// ── Persisted state ─────────────────────────────────────────────────────────

export type BackupSchedule = "off" | "daily" | "weekly";

export const SCHEDULE_META: Record<BackupSchedule, { label: string; maxAgeHours: number }> = {
  // `maxAgeHours` is the point past which a copy counts as stale. A daily job
  // that last ran 40 hours ago has missed one, and the operator should be told
  // before the day they need it rather than after.
  off: { label: "Not protected", maxAgeHours: Infinity },
  daily: { label: "Daily", maxAgeHours: 36 },
  weekly: { label: "Weekly", maxAgeHours: 8 * 24 },
};

export interface BackupPolicy {
  nodeId: NodeId;
  schedule: BackupSchedule;
  /** Null until a job has actually completed. THE gate on recovery. */
  lastSuccessAt: number | null;
  /**
   * How much this node's protected data occupies, in GB. Stored rather than
   * derived from workloads because it is a property of the DATA, not of the
   * hardware it currently sits on: migrating a database to a bigger host does
   * not make its backup larger.
   */
  sizeGb: number;
}

export interface BackupState {
  tier: StorageTierId;
  policies: Record<NodeId, BackupPolicy>;
  /**
   * Nodes whose data was permanently lost — a restore attempted with nothing
   * to restore from. ONE-WAY on purpose: buying storage afterwards does not
   * bring back data that was never copied, and letting it clear would remove
   * the only real consequence in the whole feature.
   */
  dataLost: NodeId[];
  /** Every restore attempt, successful or not. An audit trail, not a to-do. */
  log: RestoreEvent[];
}

export interface RestoreEvent {
  id: string;
  at: number;
  nodeId: NodeId;
  ok: boolean;
  detail: string;
}

export function createBackupState(): BackupState {
  return { tier: "none", policies: {}, dataLost: [], log: [] };
}

// ── Derivation ──────────────────────────────────────────────────────────────

/** Roles worth protecting. Everything else is rebuildable from an image. */
export const PROTECTABLE_ROLES = [
  "domain-controller",
  "database",
  "file-server",
  "app-server",
] as const;

export function isProtectable(node: TargetNode): boolean {
  return (PROTECTABLE_ROLES as readonly string[]).includes(node.role);
}

/** Default footprint for a node with no policy yet, so the cost is visible. */
export function defaultSizeGb(node: TargetNode): number {
  switch (node.role) {
    case "database":
      return 900;
    case "file-server":
      return 1400;
    case "domain-controller":
      return 120;
    default:
      return 400;
  }
}

export interface CapacityReport {
  tier: StorageTier;
  /** Sum of the protected nodes' footprints. */
  usedGb: number;
  capacityGb: number;
  freeGb: number;
  usedPct: number;
  overCapacity: boolean;
  protectedCount: number;
}

export function capacityOf(infra: InfrastructureState): CapacityReport {
  const backup = infra.backup ?? createBackupState();
  const tier = tierById(backup.tier);
  const active = Object.values(backup.policies).filter((p) => p.schedule !== "off");
  const usedGb = active.reduce((n, p) => n + p.sizeGb, 0);
  const capacityGb = tier.capacityGb;
  return {
    tier,
    usedGb,
    capacityGb,
    freeGb: Math.max(0, capacityGb - usedGb),
    usedPct: capacityGb > 0 ? (usedGb / capacityGb) * 100 : usedGb > 0 ? 999 : 0,
    overCapacity: usedGb > capacityGb,
    protectedCount: active.length,
  };
}

export type SafetyStatus =
  | "unprotected"
  | "no-storage"
  | "over-capacity"
  | "never-run"
  | "stale"
  | "protected"
  | "lost";

export const SAFETY_META: Record<SafetyStatus, { label: string; tone: "ok" | "warn" | "bad" }> = {
  unprotected: { label: "Not protected", tone: "warn" },
  "no-storage": { label: "No storage bought", tone: "bad" },
  "over-capacity": { label: "Will not fit", tone: "bad" },
  "never-run": { label: "Never run", tone: "warn" },
  stale: { label: "Stale", tone: "warn" },
  protected: { label: "Protected", tone: "ok" },
  lost: { label: "Data lost", tone: "bad" },
};

export interface NodeSafety {
  nodeId: NodeId;
  hostname: string;
  status: SafetyStatus;
  policy: BackupPolicy | null;
  /** Hours since the last good copy, or null if there has never been one. */
  ageHours: number | null;
  detail: string;
}

/**
 * How safe each protectable node is, in the order an operator worries about it.
 *
 * `lost` outranks everything: a node whose data is gone is not made safe by a
 * policy configured afterwards, and showing it as "Protected" because the
 * schedule is now daily would be the single most dishonest thing this screen
 * could do.
 */
export function safetyOf(infra: InfrastructureState, now = Date.now()): NodeSafety[] {
  const backup = infra.backup ?? createBackupState();
  const cap = capacityOf(infra);

  return Object.values(infra.nodes)
    .filter(isProtectable)
    .map((node) => {
      const policy = backup.policies[node.nodeId] ?? null;
      const base = { nodeId: node.nodeId, hostname: node.hostname, policy };

      if (backup.dataLost.includes(node.nodeId)) {
        return {
          ...base,
          status: "lost" as const,
          ageHours: null,
          detail: "Data was lost — there was no backup to restore from.",
        };
      }
      if (!policy || policy.schedule === "off") {
        return {
          ...base,
          status: "unprotected" as const,
          ageHours: null,
          detail: "No backup schedule. Nothing to restore if this host is lost.",
        };
      }
      if (cap.tier.capacityGb === 0) {
        return {
          ...base,
          status: "no-storage" as const,
          ageHours: null,
          detail: "A schedule is set, but no storage has been bought — the job has nowhere to write.",
        };
      }
      if (cap.overCapacity) {
        return {
          ...base,
          status: "over-capacity" as const,
          ageHours: null,
          detail: `Protected data (${cap.usedGb} GB) exceeds ${cap.tier.label} (${cap.capacityGb} GB). Jobs are failing.`,
        };
      }
      if (policy.lastSuccessAt == null) {
        return {
          ...base,
          status: "never-run" as const,
          ageHours: null,
          detail: "Scheduled, but no job has completed yet. There is nothing to restore.",
        };
      }

      const ageHours = (now - policy.lastSuccessAt) / 3_600_000;
      const limit = SCHEDULE_META[policy.schedule].maxAgeHours;
      if (ageHours > limit) {
        return {
          ...base,
          status: "stale" as const,
          ageHours,
          detail: `Last good copy is ${Math.round(ageHours)}h old — the ${policy.schedule} job has missed a run.`,
        };
      }
      return {
        ...base,
        status: "protected" as const,
        ageHours,
        detail: `Last good copy ${Math.round(ageHours)}h ago.`,
      };
    });
}

export interface RestoreAvailability {
  /** Can a restore actually run for this node right now? */
  possible: boolean;
  /** Why not, in the operator's language. Null when it can. */
  reason: string | null;
  /** True when attempting anyway would destroy the data permanently. */
  destructive: boolean;
}

/**
 * Whether a restore can run, and what happens if it is attempted anyway.
 *
 * THE `destructive` FLAG IS THE POINT. Some failures are recoverable — an
 * offsite tier that is merely over capacity can be fixed by buying more.
 * Others are not: with no copy in existence, "restore" is an operation with
 * nothing on the other end, and pressing it is how the data becomes
 * permanently gone. The UI must be able to tell those two apart BEFORE the
 * operator clicks, which is why this returns both.
 */
export function restoreAvailability(
  infra: InfrastructureState,
  nodeId: NodeId,
): RestoreAvailability {
  const backup = infra.backup ?? createBackupState();

  if (backup.dataLost.includes(nodeId)) {
    return {
      possible: false,
      reason: "This host's data was already lost. There is nothing left to restore.",
      destructive: false,
    };
  }

  const policy = backup.policies[nodeId];
  const tier = tierById(backup.tier);

  if (tier.capacityGb === 0) {
    return {
      possible: false,
      reason: "No backup storage has been bought — no copy of this host exists.",
      destructive: true,
    };
  }
  if (!policy || policy.schedule === "off") {
    return {
      possible: false,
      reason: "This host was never included in a backup schedule.",
      destructive: true,
    };
  }
  if (policy.lastSuccessAt == null) {
    return {
      possible: false,
      reason: "A schedule exists but no job has ever completed — there is no copy to restore.",
      destructive: true,
    };
  }

  const cap = capacityOf(infra);
  if (cap.overCapacity) {
    return {
      possible: false,
      // Recoverable: the copy exists, the tier is simply too small to keep
      // taking new ones. Buying up fixes it, so this must NOT destroy data.
      reason: `Backups are failing — ${cap.usedGb} GB protected against ${cap.capacityGb} GB of storage. The last copy may be incomplete.`,
      destructive: false,
    };
  }

  return { possible: true, reason: null, destructive: false };
}

/**
 * Did the incident reach the backups themselves?
 *
 * On-premises tiers share the network with everything else, so an encryption
 * event takes them too. This is the mechanic that makes the offsite tier worth
 * its price, and it is checked at RESTORE time rather than baked into the
 * incident, so a player who upgrades their tier mid-incident is genuinely
 * better off — which is the correct incentive.
 */
export function backupsCompromised(infra: InfrastructureState): boolean {
  const backup = infra.backup ?? createBackupState();
  const tier = tierById(backup.tier);
  if (tier.offsite || tier.capacityGb === 0) return false;
  return (infra.incident?.compromised.length ?? 0) > 0;
}
