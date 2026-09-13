/**
 * ITQuest — Network share + local disk helpers
 * ==============================================
 * The live status of a mapped drive is DERIVED from the backing file server,
 * not stored, so it reflects reality: if the server goes offline or its SMB
 * service (LanmanServer) stops, every mapped drive pointing at it flips to
 * "disconnected" and the This PC / Finder UI shows a red ✕. Local disk usage
 * reads from the workstation's own health telemetry.
 */

import type { InfrastructureState, MappedDrive, MappedDriveStatus, TargetNode } from "@/lib/core";

/** Resolve the live status of a mapped drive from the backing server node. */
/**
 * Is this drive usable right now?
 *
 * ── THE SERVER'S STATE COMES FIRST, THEN THE CLIENT'S ───────────────────────
 *
 * Everything below the last check is derived from the SERVER, which is the
 * point: a mapped drive is a symptom and the fault is usually somewhere the
 * user cannot see. A stopped share service takes every drive in the estate
 * down at once, and no amount of clicking on the client will fix it.
 *
 * The last check is the other half, and it was missing. A drive can also fail
 * on the CLIENT alone — the session did not re-establish at logon, which is
 * the single most common mapped-drive complaint a service desk gets. Without
 * it every drive in the estate was either up or down together, so there was no
 * way to express one person's drive being broken, and no ticket could ask.
 *
 * A stored `disconnected` is therefore honoured as a real client-side state.
 * `connected` is NOT honoured in reverse: a client that believes it is
 * connected to a server that is down is simply wrong, and the server's opinion
 * settles it.
 */
export function resolveDriveStatus(infra: InfrastructureState, drive: MappedDrive): MappedDriveStatus {
  const server = findShareServer(infra, drive);
  if (!server) return "disconnected";
  if (!server.connection.online || !server.connection.reachable) return "disconnected";
  // SMB/Server service must be running for the share to serve files.
  if (server.os === "windows") {
    const smb = server.services["FleetShare"];
    if (smb && smb.status !== "Running") return "disconnected";
  }
  /*
   * AD share permissions revoked → authenticated but access denied.
   *
   * NOTE: gated on `flaggedDomains`, which is empty in a starter estate, so
   * this branch cannot fire at growth phase 1. That coupling looks accidental
   * — a phishing signal has no bearing on a share ACL — but it is left as
   * found rather than changed on the way past.
   */
  if (infra.security.flaggedDomains?.length && drive.status === "auth_error") return "auth_error";
  // The client's own session, which is the half that lets ONE person's drive
  // be broken while everybody else's is fine.
  if (drive.status === "disconnected") return "disconnected";
  return "connected";
}

export function findShareServer(infra: InfrastructureState, drive: MappedDrive): TargetNode | undefined {
  if (drive.serverNodeId && infra.nodes[drive.serverNodeId]) return infra.nodes[drive.serverNodeId];
  // Fall back to matching the hostname embedded in the UNC path.
  const host = drive.remotePath.replace(/^\\\\/, "").replace(/^smb:\/\//, "").split(/[\\/]/)[0]?.toLowerCase();
  return host ? Object.values(infra.nodes).find((n) => n.hostname.toLowerCase() === host) : undefined;
}

// ── Local disk ───────────────────────────────────────────────────────────────

const GB = 1024 ** 3;

export interface DiskInfo {
  totalGb: number;
  usedPct: number;
  freeGb: number;
  /** True at ≥98% — the "0 bytes free / drive full" crash state. */
  critical: boolean;
}

export function diskInfo(totalGb: number, usedPct: number): DiskInfo {
  const critical = usedPct >= 98;
  const freeGb = critical ? 0 : Math.max(0, Math.round(totalGb * (1 - usedPct / 100)));
  return { totalGb, usedPct, freeGb, critical };
}

export function formatBytesFromGb(gb: number): string {
  if (gb <= 0) return "0 bytes";
  if (gb < 1) return `${Math.round(gb * 1024)} MB`;
  return `${gb} GB`;
}

export const _GB = GB;
