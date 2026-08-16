/**
 * ITQuest — The live hint engine (polish pass)
 * =============================================
 * Hints that read the ESTATE, not the template.
 *
 * ── WHAT WAS WRONG WITH THE OLD ONES ────────────────────────────────────────
 *
 * Every template carried two or three hand-written strings: "Identify the
 * infected node from the alert", "NetOps Console → isolate the node". Fine as
 * far as they went, and they went nowhere near far enough — they were written
 * when the template was written, so they cannot name the port that is actually
 * down, the account that is actually locked, or the switch that is actually
 * over budget. A player stuck on "which port?" is told to check the panel they
 * are already looking at.
 *
 * Worse, a static hint can be WRONG. It keeps saying "isolate the host" after
 * the host has been isolated, because it has no way to know.
 *
 * ── HOW THIS WORKS ──────────────────────────────────────────────────────────
 *
 * A hint is DERIVED, on demand, from the same state every panel reads. Three
 * stages, escalating in specificity, because the point is to unstick a player
 * without solving it for them:
 *
 *   1. WHERE — which app to open. Costs the least; often enough on its own.
 *   2. WHAT — the specific fault, named from live state: "Port 7 on
 *      MERC-PSW-01 is administratively down."
 *   3. HOW — the exact action that resolves it.
 *
 * Stage 2 is the one that could not exist before, and it is the reason this
 * file is a set of PROBES rather than a lookup table. Each probe asks the world
 * a question and returns a finding only if the fault is really there right now.
 * A probe that finds nothing contributes nothing, so a hint can never describe
 * a problem the player has already fixed.
 *
 * ── FALLING BACK HONESTLY ───────────────────────────────────────────────────
 *
 * When no probe fires — the estate looks clean but the ticket is still open —
 * the engine says exactly that rather than inventing guidance. "Nothing is
 * visibly broken; re-check the requester's account" is true and useful.
 * Fabricating a specific fault would be worse than the static hints it
 * replaced.
 */

import type { InfrastructureState, NodeId, Ticket } from "@/lib/core";
import {
  capacityOf,
  computeTraffic,
  detectConflicts,
  isIsolated,
  recoveryStatus,
  restoreAvailability,
  safetyOf,
  switchPower,
} from "@/lib/core";
import type { HostAppId } from "@/lib/core";

export interface HintStage {
  /** 1 = where, 2 = what, 3 = how. */
  stage: 1 | 2 | 3;
  text: string;
  /** The app this stage points at, when there is one. */
  app?: HostAppId;
}

/** Which app a ticket's work lives in, inferred from its tags. */
const TAG_APP: [string, HostAppId][] = [
  ["ransomware", "backup"],
  ["backup", "backup"],
  ["recovery", "backup"],
  ["disaster-recovery", "backup"],
  ["poe", "switches"],
  ["ip-conflict", "switches"],
  ["camera", "switches"],
  ["dhcp", "switches"],
  ["rack", "racklab"],
  ["thermal", "racklab"],
  ["pdu", "racklab"],
  ["migration", "serverman"],
  ["capacity-plan", "serverman"],
  ["hardware", "hardwarelab"],
  ["ram", "hardwarelab"],
  ["raid", "hardwarelab"],
  ["bios", "hardwarelab"],
  ["imaging", "hardwarelab"],
  ["congestion", "netops"],
  ["firewall", "netops"],
  ["containment", "netops"],
  ["isolation", "netops"],
  ["procurement", "procurement"],
  ["shipping", "procurement"],
  ["cloud", "aethercloud"],
  ["aether", "aethercloud"],
  // Mail-borne work is done in the mailbox, not by remoting into a server.
  // Stage 1 previously sent phishing tickets to the Remote Gateway by falling
  // through to the default, which is precisely the misdirection this engine
  // exists to remove.
  ["phishing", "coremail"],
  ["email-security", "coremail"],
  ["shares", "gateway"],
  ["acl", "gateway"],
  ["ad", "gateway"],
  ["identity", "gateway"],
];

export function appForTicket(ticket: Ticket): HostAppId {
  for (const [tag, app] of TAG_APP) {
    if (ticket.tags.includes(tag)) return app;
  }
  // Almost everything else is worked by remoting into the affected machine.
  return "gateway";
}

const APP_TITLE: Record<string, string> = {
  backup: "Backup & Recovery",
  switches: "Network Switches",
  racklab: "the Datacenter Floor",
  serverman: "Server Manager",
  hardwarelab: "the Hardware Lab",
  netops: "the NetOps Console",
  procurement: "Procurement",
  aethercloud: "the AetherCloud console",
  gateway: "the Remote Gateway",
  coremail: "CoreMail",
  itsm: "the Ticket Center",
  monitor: "the Monitor",
};

// ── Probes ──────────────────────────────────────────────────────────────────
//
// Each returns a specific, presently-true finding — or null. Ordered by how
// badly the fault blocks the operator, so the first hit is the one worth
// naming first.

interface Finding {
  what: string;
  how: string;
  app?: HostAppId;
}

type Probe = (infra: InfrastructureState, ticket: Ticket) => Finding | null;

/** An active ransomware incident dominates everything else. */
const probeIncident: Probe = (infra) => {
  const rec = recoveryStatus(infra);
  if (rec.stage === "clean" || rec.stage === "restored") return null;
  return {
    what:
      rec.stage === "spreading"
        ? `${rec.patientZero} is compromised and still on the network — it is re-encrypting whatever you clean.`
        : rec.stage === "lost"
          ? "The data is gone: a restore was attempted with no backup in existence."
          : `The incident is contained. ${rec.compromisedCount} host${rec.compromisedCount === 1 ? "" : "s"} still need work.`,
    how: rec.nextAction ?? "Follow the sequence in Backup & Recovery.",
    app: rec.nextApp ?? "backup",
  };
};

/** A switch port that is administratively down, or shedding for want of power. */
const probePoe: Probe = (infra) => {
  for (const sw of infra.poe?.switches ?? []) {
    const power = switchPower(sw, infra.nodes);

    const down = sw.ports.find((p) => p.attachedNodeId && !p.enabled);
    if (down) {
      const host = infra.nodes[down.attachedNodeId!]?.hostname ?? down.attachedNodeId;
      return {
        what: `Port ${down.n} on ${sw.name} is administratively down, so ${host} is dark.`,
        how: `Open Network Switches, select port ${down.n}, and switch "Port enabled" back on.`,
        app: "switches",
      };
    }

    const shed = power.shedPorts[0];
    if (shed != null) {
      const port = sw.ports.find((p) => p.n === shed);
      const host = port?.attachedNodeId ? infra.nodes[port.attachedNodeId]?.hostname : "a device";
      return {
        what: `${sw.name} is over its ${sw.budgetW}W PoE budget — port ${shed} (${host}) has been dropped.`,
        how: "Free up budget: lower a camera's priority, or switch PoE off on something that can wait.",
        app: "switches",
      };
    }

    const noPoe = sw.ports.find((p) => p.attachedNodeId && p.enabled && !p.poeEnabled);
    if (noPoe) {
      const host = infra.nodes[noPoe.attachedNodeId!]?.hostname ?? noPoe.attachedNodeId;
      return {
        what: `Port ${noPoe.n} on ${sw.name} has PoE switched off, and ${host} has no other power source.`,
        how: `Open Network Switches, select port ${noPoe.n}, and re-enable PoE.`,
        app: "switches",
      };
    }
  }
  return null;
};

/** A duplicate or reserved address currently in force. */
const probeIpConflict: Probe = (infra) => {
  const conflicts = detectConflicts({
    nodes: infra.nodes,
    subnets: infra.subnets,
    ipam: infra.ipam,
  }).filter((c) => c.blocking);
  const first = conflicts[0];
  if (!first) return null;
  return {
    what: first.detail,
    how: first.remedy,
    app: "switches",
  };
};

/** A saturated uplink or backbone. */
const probeSaturation: Probe = (infra) => {
  const traffic = computeTraffic(infra);
  if (traffic.level === "clear" || traffic.level === "busy") return null;
  const worst = [traffic.backbone, ...traffic.uplinks]
    .filter((s) => s.level === traffic.level)
    .sort((a, b) => b.loadPct - a.loadPct)[0];
  if (!worst) return null;
  return {
    what: `${worst.label} is carrying ${worst.offeredMbps} Mbps into ${worst.capacityMbps} Mbps of capacity — ${Math.round(worst.loadPct)}% of the link.`,
    how: "Lower a camera's resolution, stop recording one, or fit a faster uplink in Network Switches.",
    app: "switches",
  };
};

/** A locked or disabled directory account — the classic Tier 1. */
const probeDirectory: Probe = (infra, ticket) => {
  const sam = ticket.dynamicContext?.targetUserId;
  if (!sam) return null;
  for (const node of Object.values(infra.nodes)) {
    const ad = node.os === "windows" ? node.activeDirectory : undefined;
    const user = ad?.users.find((u) => u.samAccountName === sam);
    if (!user) continue;
    if (user.locked) {
      return {
        what: `${user.displayName} (${sam}) is locked out — repeated bad sign-ins tripped the lockout threshold.`,
        how: "Remote into the domain controller, open the Admin Center directory, find the account and clear the lockout.",
        app: "gateway",
      };
    }
    if (!user.enabled) {
      return {
        what: `${user.displayName} (${sam}) is disabled, which is why sign-in fails even with the right password.`,
        how: "Re-enable the account from the Admin Center directory.",
        app: "gateway",
      };
    }
  }
  return null;
};

/** A tripped breaker or a rack cooking itself. */
const probeRack: Probe = (infra) => {
  const rack = infra.datacenter?.racks.find((r) => r.breakerTripped);
  if (!rack) return null;
  return {
    what: `${rack.name}'s PDU breaker is open — everything in that rack is down, not just the host on the ticket.`,
    how: "Open the Datacenter Floor, shed some load off that rack, then reset the breaker.",
    app: "racklab",
  };
};

/** A stopped service on the node the ticket names. */
const probeService: Probe = (infra, ticket) => {
  const id = ticket.dynamicContext?.targetNodeId as NodeId | undefined;
  const node = id ? infra.nodes[id] : undefined;
  if (!node) return null;

  if (node.os === "linux") {
    const failed = Object.values(node.services ?? {}).find((s) => s.status !== "active");
    if (failed) {
      return {
        what: `${failed.name} is ${failed.status} on ${node.hostname}.`,
        how: `SSH into ${node.hostname} and start ${failed.name}.`,
        app: "gateway",
      };
    }
  }
  if (node.os === "windows") {
    const stopped = Object.values(node.services ?? {}).find(
      (s) => s.startupType === "Automatic" && s.status !== "Running",
    );
    if (stopped) {
      return {
        what: `${stopped.name} is set to start automatically on ${node.hostname} but is not running.`,
        how: `RDP into ${node.hostname}, open Services, and start ${stopped.name}.`,
        app: "gateway",
      };
    }
  }
  return null;
};

/** Backups that cannot restore — relevant the moment a DR ticket is open. */
const probeBackup: Probe = (infra, ticket) => {
  if (!ticket.tags.some((t) => t === "backup" || t === "recovery" || t === "disaster-recovery")) {
    return null;
  }
  const cap = capacityOf(infra);
  if (cap.tier.capacityGb === 0) {
    return {
      what: "No backup storage has been bought, so nothing on this estate can be restored.",
      how: "Open Backup & Recovery and buy a storage tier, then set a schedule on the critical hosts.",
      app: "backup",
    };
  }
  if (cap.overCapacity) {
    return {
      what: `Protected data (${cap.usedGb} GB) exceeds ${cap.tier.label} (${cap.capacityGb} GB) — the jobs are failing.`,
      how: "Buy a larger tier, or take a host out of the schedule.",
      app: "backup",
    };
  }
  const never = safetyOf(infra).find((r) => r.status === "never-run" || r.status === "unprotected");
  if (never) {
    return {
      what: `${never.hostname} has no usable restore point — ${never.detail}`,
      how: "Set a schedule on it in Backup & Recovery and run the jobs.",
      app: "backup",
    };
  }
  return null;
};

/**
 * Order matters: the first probe to fire is the one the hint names.
 *
 * Sorted by how completely the fault blocks progress. A ransomware incident
 * makes every other reading meaningless, and a dead switch port explains a
 * service outage better than the stopped service does.
 */
const PROBES: Probe[] = [
  probeIncident,
  probeRack,
  probePoe,
  probeIpConflict,
  probeSaturation,
  probeDirectory,
  probeService,
  probeBackup,
];

/**
 * The hint ladder for a ticket, against the world as it is right now.
 *
 * Always returns three stages so the reveal mechanic has something at every
 * step, and so the XP cost the operator agreed to buys a real escalation
 * rather than a repeat of what they already read.
 */
export function liveHints(infra: InfrastructureState, ticket: Ticket): HintStage[] {
  const app = appForTicket(ticket);
  const where = APP_TITLE[app] ?? "the relevant console";

  let finding: Finding | null = null;
  for (const probe of PROBES) {
    try {
      finding = probe(infra, ticket);
    } catch {
      // A probe that throws on an unusual world must not take the hint system
      // with it — the operator asked for help, and a crash is the one response
      // worse than none.
      finding = null;
    }
    if (finding) break;
  }

  const stage1: HintStage = {
    stage: 1,
    app: finding?.app ?? app,
    text: `Start in ${APP_TITLE[finding?.app ?? app] ?? where}. That is where this class of fault is diagnosed and fixed.`,
  };

  if (!finding) {
    /*
     * Nothing is visibly broken. Said plainly rather than dressed up: the
     * static hints this replaced were confidently wrong in exactly this
     * situation, and "I cannot see it from here" is more useful than a
     * fabricated fault.
     */
    const fallback = ticket.hints?.length ? ticket.hints : [];
    return [
      stage1,
      {
        stage: 2,
        text:
          fallback[0] ??
          "Nothing on the estate is reporting a fault right now — the cause is likely specific to the requester's account or session rather than the infrastructure.",
        app: stage1.app,
      },
      {
        stage: 3,
        text:
          fallback[1] ??
          "Re-read what the requester actually said: the objective in the ticket names the exact end state being graded.",
        app: stage1.app,
      },
    ];
  }

  return [
    stage1,
    { stage: 2, text: finding.what, app: finding.app },
    { stage: 3, text: finding.how, app: finding.app },
  ];
}
