/**
 * ITQuest — Ransomware compromise and the recovery sequence (DR build)
 * =====================================================================
 * The one incident in the game where the order of operations is the whole
 * exercise. Isolate, then wipe, then restore. Do them out of order and you
 * either reinfect what you just cleaned or destroy the only copy of the data.
 *
 * ── WHAT IS STORED ──────────────────────────────────────────────────────────
 *
 *   - PATIENT ZERO — the endpoint that opened the thing
 *   - which SHARES are encrypted
 *   - which NODES are compromised
 *   - the timestamps of the wipe and the restore
 *
 * That is a record of what HAPPENED. Everything about what it MEANS derives.
 *
 * ── WHAT IS DERIVED ─────────────────────────────────────────────────────────
 *
 *   - which stage of the recovery the operator has reached
 *   - whether isolation is currently in force
 *   - what the next correct action is
 *   - the impact on services and on the health score
 *
 * ── WHY ISOLATION IS DERIVED RATHER THAN STORED ─────────────────────────────
 *
 * There are two honest ways to isolate a machine in this simulator: disable
 * its switch port, or contain it from the NetOps console. Both genuinely cut
 * it off. A stored `isolated: true` set by one of them would let the other
 * path leave the flag wrong — an operator who pulls the port would be told the
 * host is still spreading, and an operator who lifts a containment while the
 * port stays down would be told it is loose when it is not.
 *
 * So isolation is a QUESTION asked of the world, answered from the port state
 * and the containment list. Either counts. Both are undone by undoing them.
 *
 * SVG icons and typographic glyphs only in anything that renders this — no
 * emoji.
 */

import type { NodeId } from "./nodes";
import type { InfrastructureState } from "./infrastructure";

// ── Persisted state ─────────────────────────────────────────────────────────

export interface CompromiseRecord {
  nodeId: NodeId;
  at: number;
  /** How it got here — patient zero clicked; the rest were reached over SMB. */
  vector: "phishing" | "lateral";
  /** Set when the operator wipes and rebuilds this host. */
  wipedAt?: number;
  /** Set when data is successfully restored onto it. */
  restoredAt?: number;
}

export interface IncidentState {
  /** Null when the estate is clean. */
  startedAt: number | null;
  /** The endpoint that opened the attachment. */
  patientZero: NodeId | null;
  compromised: CompromiseRecord[];
  /** Shares whose contents are encrypted, by share id. */
  encryptedShareIds: string[];
  /** Set once the whole sequence completes, so the ticket can grade it. */
  containedAt: number | null;
  resolvedAt: number | null;
}

export function createIncidentState(): IncidentState {
  return {
    startedAt: null,
    patientZero: null,
    compromised: [],
    encryptedShareIds: [],
    containedAt: null,
    resolvedAt: null,
  };
}

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * Is this node cut off from the rest of the estate right now?
 *
 * EITHER mechanism counts, and neither is privileged. See the header for why
 * this is a question rather than a flag.
 */
export function isIsolated(infra: InfrastructureState, nodeId: NodeId): boolean {
  if (infra.security.isolatedNodeIds.includes(nodeId)) return true;
  for (const sw of infra.poe?.switches ?? []) {
    const port = sw.ports.find((p) => p.attachedNodeId === nodeId);
    if (port && !port.enabled) return true;
  }
  return false;
}

/** How the operator cut it off, for the UI to report accurately. */
export function isolationMethod(
  infra: InfrastructureState,
  nodeId: NodeId,
): "containment" | "port" | null {
  if (infra.security.isolatedNodeIds.includes(nodeId)) return "containment";
  for (const sw of infra.poe?.switches ?? []) {
    const port = sw.ports.find((p) => p.attachedNodeId === nodeId);
    if (port && !port.enabled) return "port";
  }
  return null;
}

export type RecoveryStage =
  | "clean"
  | "spreading"
  | "isolated"
  | "wiped"
  | "restored"
  | "lost";

export const STAGE_META: Record<RecoveryStage, { label: string; tone: "ok" | "warn" | "bad" }> = {
  clean: { label: "No active incident", tone: "ok" },
  spreading: { label: "Spreading", tone: "bad" },
  isolated: { label: "Contained", tone: "warn" },
  wiped: { label: "Wiped — awaiting restore", tone: "warn" },
  restored: { label: "Recovered", tone: "ok" },
  lost: { label: "Data lost", tone: "bad" },
};

export interface RecoveryStatus {
  stage: RecoveryStage;
  /** The single next thing to do, in the operator's language. */
  nextAction: string | null;
  /** Which app that action lives in, so the UI can point at it. */
  nextApp: "switches" | "gateway" | "backup" | null;
  patientZero: NodeId | null;
  encryptedShareIds: string[];
  compromisedCount: number;
}

/**
 * Where the operator is in the sequence, and what to do next.
 *
 * ORDER IS ENFORCED BY DERIVATION, not by disabling buttons in three different
 * screens. Each stage is simply the truth about the world: a host that is not
 * isolated IS still spreading, whatever the operator has clicked elsewhere. If
 * they re-enable the port after wiping, this drops back to `spreading` — which
 * is correct, and is the kind of thing a stored stage counter would get wrong.
 */
export function recoveryStatus(infra: InfrastructureState): RecoveryStatus {
  const incident = infra.incident ?? createIncidentState();
  const base = {
    patientZero: incident.patientZero,
    encryptedShareIds: incident.encryptedShareIds,
    compromisedCount: incident.compromised.length,
  };

  if (!incident.startedAt || incident.compromised.length === 0) {
    return { ...base, stage: "clean", nextAction: null, nextApp: null };
  }

  const lost = (infra.backup?.dataLost.length ?? 0) > 0;
  const zero = incident.patientZero;

  // 1. ISOLATION. Nothing else is worth doing while it is still spreading —
  //    a share wiped on a live network is a share that gets re-encrypted.
  if (zero && !isIsolated(infra, zero)) {
    // Only offer the port route when the host is actually ON a port. Naming a
    // control that does not exist for this machine sends the operator hunting
    // through a panel it will never appear in.
    const onAPort = (infra.poe?.switches ?? []).some((sw) =>
      sw.ports.some((p) => p.attachedNodeId === zero),
    );
    return {
      ...base,
      stage: "spreading",
      nextAction: onAPort
        ? `Isolate ${zero} — disable its switch port, or contain it from NetOps. Wiping anything before this just gets re-encrypted.`
        : `Isolate ${zero} — contain it from the NetOps console. It is not on a managed switch port, so there is no port to pull. Wiping anything before this just gets re-encrypted.`,
      nextApp: onAPort ? "switches" : "gateway",
    };
  }

  /*
   * 2. WIPE THE SERVERS.
   *
   * PATIENT ZERO IS EXCLUDED, and that is a correction rather than a
   * shortcut. Found by playing the loop: a staff laptop is not a Remote
   * Gateway target — it has no rack, no console, and the gateway deliberately
   * skips the fleet — so there is no session to open and no wipe button to
   * press. Requiring it left the sequence stuck at "isolated" with an
   * instruction the operator could not carry out anywhere in the product.
   *
   * It is also what actually happens: the infected endpoint is isolated and
   * then goes to the bench to be re-imaged by hand. The thing you wipe and
   * restore REMOTELY is the server. Isolation is the whole of the operator's
   * job on patient zero, and the sequence now says so.
   */
  const unwiped = incident.compromised.filter(
    (c) => c.nodeId !== incident.patientZero && !c.wipedAt,
  );
  if (unwiped.length > 0) {
    return {
      ...base,
      stage: "isolated",
      nextAction: `Wipe and rebuild ${unwiped.map((c) => c.nodeId).join(", ")} from the server console. Restoring onto an infected host re-encrypts the copy.`,
      nextApp: "gateway",
    };
  }

  if (lost) {
    return {
      ...base,
      stage: "lost",
      nextAction:
        "The data is gone — there was no backup to restore from. Buy storage and set a schedule so the next incident is survivable.",
      nextApp: "backup",
    };
  }

  // 3. RESTORE.
  const unrestored = incident.compromised.filter(
    (c) => c.nodeId !== incident.patientZero && !c.restoredAt,
  );
  if (unrestored.length > 0) {
    return {
      ...base,
      stage: "wiped",
      nextAction: `Restore ${unrestored.map((c) => c.nodeId).join(", ")} from backup.`,
      nextApp: "backup",
    };
  }

  return { ...base, stage: "restored", nextAction: null, nextApp: null };
}

/** Is this share readable, or is its content encrypted? */
export function isShareEncrypted(infra: InfrastructureState, shareId: string): boolean {
  return (infra.incident?.encryptedShareIds ?? []).includes(shareId);
}

export function isCompromised(infra: InfrastructureState, nodeId: NodeId): boolean {
  const rec = infra.incident?.compromised.find((c) => c.nodeId === nodeId);
  return !!rec && !rec.wipedAt;
}

/**
 * What the incident costs the estate's health.
 *
 * Scaled by STAGE rather than by a flat "there is an incident" penalty,
 * because the operator's work has to show up somewhere immediately. Isolating
 * patient zero does not fix anything yet, but it stops the bleeding, and a
 * score that did not move until the very end would teach that the first two
 * steps of the sequence are ceremony.
 */
export function incidentHealthPenalty(stage: RecoveryStage): number {
  switch (stage) {
    case "spreading":
      return 45;
    case "isolated":
      return 30;
    case "wiped":
      return 18;
    case "lost":
      return 35;
    default:
      return 0;
  }
}
