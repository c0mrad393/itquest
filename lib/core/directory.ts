/**
 * TriageOS — Service reachability & the enterprise directory (v0.5.0)
 * ==================================================================
 * v0.4.0 unified the physical and logical halves of a SERVER. This module does
 * the same thing one layer up: it makes every application in the OS answer to
 * the state of the datacenter.
 *
 * THE PROBLEM IT SOLVES. An admin console that opens whatever the estate is
 * doing is a lie. If the rack feeding the domain controller has tripped its
 * breaker, "Active Directory Users & Computers" must not cheerfully list
 * users — it must fail the way it would really fail, and say which of the five
 * things that could be wrong actually is.
 *
 * THE DIAGNOSIS IS THE POINT. `reachService` walks the dependency chain from
 * the bottom up and stops at the FIRST broken link:
 *
 *   missing   there is no such server in the estate
 *   physical  it is not racked, or its rack is dark / cooking
 *   power     the chassis is powered down
 *   network   no top-of-rack uplink, or the node is isolated
 *   service   the host is up but the service itself is not running
 *
 * Each answer names the app that fixes it, because "Domain Controller
 * Unreachable" on its own teaches nothing. A cascading failure should read as
 * a trail to follow, not a dead end.
 *
 * Everything here is PURE. The apps and the ticket win-conditions call the
 * same functions, so what the operator is told is exactly what is graded.
 */

import type { InfrastructureState, TargetNode } from "./infrastructure";
import { poeLiveness } from "./poe";
import type { NodeId, NodeRole } from "./nodes";
import { isRackable, locationOf, serverLiveness } from "./datacenter";
import type { ActiveDirectoryState, ADGroup, ADUser } from "./windows";
import { EDS_SERVICE, FILE_SERVICE } from "./branding";

// ── Reachability ────────────────────────────────────────────────────────────

export type ReachLayer = "missing" | "physical" | "power" | "network" | "service";

export interface ServiceReach {
  reachable: boolean;
  node?: TargetNode;
  /** Which link in the chain is broken. Null when the service is up. */
  layer: ReachLayer | null;
  /** What is wrong, in the operator's words. */
  reason: string | null;
  /** Where to go and fix it. */
  remedy: string | null;
}

const UP: ServiceReach = { reachable: true, layer: null, reason: null, remedy: null };

/**
 * Can this host's service be reached from the operator's workstation?
 *
 * `serviceNames` are checked against the node's own service table (systemd
 * units on Linux, SCM entries on Windows). A host that is up but whose AD DS
 * has been stopped is a genuinely different fault from a host that is down,
 * and an operator who cannot tell them apart will fix the wrong thing.
 */
export function reachNode(
  infra: InfrastructureState,
  node: TargetNode | undefined,
  serviceNames: string[] = [],
): ServiceReach {
  if (!node) {
    return {
      reachable: false,
      layer: "missing",
      reason: "No such server in this estate.",
      remedy: "Rack and provision one on the Datacenter Floor.",
    };
  }

  /*
   * THE SWITCH PORT COMES FIRST (Build 1).
   *
   * Checked ahead of the role split because it applies to BOTH paths and
   * because, when it is the answer, it is the whole answer: a camera on a
   * disabled port is not "powered off" in any sense the operator can act on
   * from the Server Manager — it is off because a port is off, and the remedy
   * names the port.
   *
   * Safe to run against everything. `poeLiveness` returns live for any node
   * not plugged into a switch, so a rack server drawing mains power is never
   * told a switch is its problem.
   */
  const poe = poeLiveness(infra.poe, node.nodeId, infra.nodes);
  if (!poe.live) {
    return {
      reachable: false,
      node,
      layer: "power",
      reason: poe.reason ?? `${node.hostname} is not being powered by its switch port.`,
      remedy: poe.remedy ?? "Check the port in Network Switches.",
    };
  }

  // CLIENT ENDPOINTS ARE NOT RACKED, AND NEVER WILL BE.
  //
  // A staff laptop is a domain-joined machine on the user network, not a
  // chassis in a cabinet. Running it through the rack chain asked "which U is
  // this laptop in", got no answer, and reported a physical fault that cannot
  // exist — which is exactly what broke Remote Support.
  //
  // The split is by ROLE, not by whether a rack happens to be found: a server
  // that is genuinely unracked IS a fault worth reporting, and this must not
  // quietly excuse it.
  if (!isRackable(node.role)) return reachEndpoint(infra, node, serviceNames);

  const at = locationOf(infra.datacenter, node.nodeId);
  if (!at) {
    return {
      reachable: false,
      node,
      layer: "physical",
      reason: `${node.hostname} is not installed in any rack.`,
      remedy: "Mount it on the Datacenter Floor and connect its uplink.",
    };
  }

  // The rack has the final word — same rule the Server Manager reports.
  const life = serverLiveness(at.rack, at.device, node, infra.nodes);
  if (!life.live) {
    const layer: ReachLayer =
      life.reason === "powered down" ? "power" : life.reason === "no uplink" ? "network" : "physical";
    return {
      reachable: false,
      node,
      layer,
      reason: `${node.hostname} is down — ${life.reason}.`,
      remedy:
        layer === "power"
          ? `Power it back on in the Server Manager.`
          : layer === "network"
            ? `Patch its uplink into ${at.rack.name}'s top-of-rack switch.`
            : `Fix ${at.rack.name} on the Datacenter Floor first.`,
    };
  }

  if (infra.security.isolatedNodeIds.includes(node.nodeId)) {
    return {
      reachable: false,
      node,
      layer: "network",
      reason: `${node.hostname} is isolated from the network by an active containment.`,
      remedy: "Lift the isolation in the NetOps Console once the incident is closed.",
    };
  }

  for (const name of serviceNames) {
    const stopped = isServiceStopped(node, name);
    if (stopped) {
      return {
        reachable: false,
        node,
        layer: "service",
        reason: `${node.hostname} is up, but ${name} is not running.`,
        remedy: `Remote into ${node.hostname} and start ${name}.`,
      };
    }
  }

  return { ...UP, node };
}

/**
 * Reachability for a client endpoint — a laptop or desktop somebody works at.
 *
 * The chain is genuinely shorter than a server's, because the things that can
 * be wrong are genuinely fewer: it is switched on, it is on the network, and
 * it has not been isolated by an incident response. There is no rack, no PDU
 * and no top-of-rack switch, so there is nothing to check and nothing to send
 * the operator to the Datacenter Floor for.
 */
function reachEndpoint(
  infra: InfrastructureState,
  node: TargetNode,
  serviceNames: string[],
): ServiceReach {
  if (!node.connection.online) {
    return {
      reachable: false,
      node,
      layer: "power",
      reason: `${node.hostname} is powered off.`,
      remedy: "Ask the user to switch it on, or wait until they are next at their desk.",
    };
  }
  if (!node.connection.reachable) {
    return {
      reachable: false,
      node,
      layer: "network",
      reason: `${node.hostname} is not answering on the network.`,
      remedy: "It may be off the corporate network — check whether they are working remotely.",
    };
  }
  if (infra.security.isolatedNodeIds.includes(node.nodeId)) {
    return {
      reachable: false,
      node,
      layer: "network",
      reason: `${node.hostname} is isolated by an active containment.`,
      remedy: "Lift the isolation in the NetOps Console once the incident is closed.",
    };
  }
  for (const name of serviceNames) {
    if (isServiceStopped(node, name)) {
      return {
        reachable: false,
        node,
        layer: "service",
        reason: `${node.hostname} is up, but ${name} is not running.`,
        remedy: `Connect to ${node.hostname} and start ${name}.`,
      };
    }
  }
  return { ...UP, node };
}

/** True when the named unit/service exists on the node and is not running. */
function isServiceStopped(node: TargetNode, name: string): boolean {
  if (node.os === "windows") {
    const svc = node.services?.[name] ?? undefined;
    return !!svc && svc.status !== "Running";
  }
  const unit = (node as { services?: Record<string, { status: string }> }).services?.[name];
  return !!unit && unit.status !== "active";
}

/** The first node in the estate holding a given role. */
export function nodeByRole(infra: InfrastructureState, role: NodeRole): TargetNode | undefined {
  return Object.values(infra.nodes).find((n) => n.role === role);
}

/**
 * Reach the domain controller. Requires the DC host AND the directory service
 * itself, because a DC whose NTDS has been stopped still answers ping.
 */
export function directoryReach(infra: InfrastructureState): ServiceReach {
  const dc =
    Object.values(infra.nodes).find((n) => n.role === "domain-controller" && "activeDirectory" in n) ??
    nodeByRole(infra, "domain-controller");
  const reach = reachNode(infra, dc, [EDS_SERVICE]);
  if (!reach.reachable && reach.layer === "missing") {
    return { ...reach, reason: "This estate has no directory server." };
  }
  return reach;
}

/** Reach the file server. Requires the SMB service, not just the host. */
export function fileServiceReach(infra: InfrastructureState): ServiceReach {
  const fs = nodeByRole(infra, "file-server");
  const reach = reachNode(infra, fs, [FILE_SERVICE]);
  if (!reach.reachable && reach.layer === "missing") {
    return { ...reach, reason: "This estate has no file server." };
  }
  return reach;
}

/** The live directory, or undefined when the DC cannot be reached. */
export function liveDirectory(infra: InfrastructureState): ActiveDirectoryState | undefined {
  const reach = directoryReach(infra);
  if (!reach.reachable || !reach.node) return undefined;
  return "activeDirectory" in reach.node ? reach.node.activeDirectory : undefined;
}

// ── Gateway binding ─────────────────────────────────────────────────────────

export interface GatewayTarget {
  nodeId: NodeId;
  node: TargetNode;
  /** Live now — the Connect button is only enabled for these. */
  connectable: boolean;
  /** Why not, when it is not. */
  reason: string | null;
  /** "Rack 01 · U4" for racked hosts; empty for endpoints. */
  location: string;
}

/**
 * What the Remote Gateway may offer, derived from the datacenter rather than
 * from a list captured at world generation.
 *
 * RACKED hosts are filtered by physical reality: powered, uplinked, and behind
 * a healthy rack. Unrack a server or trip its PDU and it drops out of this
 * list on the same frame.
 *
 * ENDPOINTS are not racked — a rule that hid every staff laptop because it is
 * not in a cabinet would be nonsense — so they pass through on their own
 * connection state. The estate's hundreds of fleet machines stay out entirely;
 * those are reached per-user through ADUC.
 */
export function gatewayTargets(infra: InfrastructureState): GatewayTarget[] {
  const FLEET = "fleet-endpoint";
  const out: GatewayTarget[] = [];

  for (const node of Object.values(infra.nodes)) {
    if (node.tags.includes(FLEET)) continue;

    const at = locationOf(infra.datacenter, node.nodeId);
    if (at) {
      const life = serverLiveness(at.rack, at.device, node, infra.nodes);
      const isolated = infra.security.isolatedNodeIds.includes(node.nodeId);
      // A dark server is not listed as "offline" — it is not listed as
      // reachable. The gateway shows what the estate HAS, greyed out with the
      // reason, so a disappearing row never looks like a bug.
      out.push({
        nodeId: node.nodeId,
        node,
        connectable: life.live && !isolated,
        reason: isolated ? "isolated by containment" : life.reason,
        location: `${at.rack.name} · U${at.device.uStart}`,
      });
      continue;
    }

    // Endpoints and anything else with a gateway entry from the generator.
    const listed = infra.gateway.some((g) => g.nodeId === node.nodeId);
    if (!listed) continue;
    const isolated = infra.security.isolatedNodeIds.includes(node.nodeId);
    out.push({
      nodeId: node.nodeId,
      node,
      connectable: node.connection.online && node.connection.reachable && !isolated,
      reason: isolated
        ? "isolated by containment"
        : !node.connection.online
          ? "powered down"
          : !node.connection.reachable
            ? "no network path"
            : null,
      location: "",
    });
  }

  return out.sort((a, b) => {
    // Infrastructure first, then by hostname — the operator is nearly always
    // looking for a server, not a laptop.
    const rank = (t: GatewayTarget) => (t.location ? 0 : 1);
    return rank(a) - rank(b) || a.node.hostname.localeCompare(b.node.hostname);
  });
}

// ── Directory helpers (pure) ────────────────────────────────────────────────

export function userBySam(ad: ActiveDirectoryState, sam: string): ADUser | undefined {
  return ad.users.find((u) => u.samAccountName === sam);
}

export function groupByName(ad: ActiveDirectoryState, name: string): ADGroup | undefined {
  return ad.groups.find((g) => g.name === name);
}

/**
 * Every group a user effectively belongs to, following nesting.
 *
 * Nested groups are the classic reason a permission audit disagrees with
 * reality, so the simulation resolves them properly rather than checking
 * direct membership only.
 */
export function effectiveGroups(ad: ActiveDirectoryState, sam: string): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const g of ad.groups) {
    if (g.members.includes(sam)) queue.push(g.name);
  }
  const user = userBySam(ad, sam);
  if (user) queue.push(...user.memberOf);

  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const g of ad.groups) {
      if (g.members.includes(name)) queue.push(g.name);
    }
  }
  return [...seen];
}

export function isMemberOf(ad: ActiveDirectoryState, sam: string, group: string): boolean {
  return effectiveGroups(ad, sam).includes(group);
}

// ── Endpoint mapping (v0.8.0) ───────────────────────────────────────────────

/**
 * The workstation a member of staff sits at.
 *
 * DERIVED rather than stored. The generator mints a fleet of endpoints and a
 * directory of several hundred accounts; recording a mapping between them
 * would be a third table to keep consistent through every hire, every leaver
 * and every growth milestone. A stable hash over the account name picks the
 * same machine every time without any of that.
 *
 * Returns undefined when the estate has no endpoints — a startup where
 * everyone is on a laptop nobody has enrolled yet.
 */
export function endpointForUser(
  infra: InfrastructureState,
  sam: string,
): TargetNode | undefined {
  const fleet = Object.values(infra.nodes)
    .filter((n) => n.role === "workstation")
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  if (!fleet.length) return undefined;

  let h = 0;
  for (const ch of sam) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fleet[h % fleet.length];
}
