/**
 * TriageOS — Network share + local disk helpers
 * ==============================================
 * The live status of a mapped drive is DERIVED from the backing file server,
 * not stored, so it reflects reality: if the server goes offline or its SMB
 * service (LanmanServer) stops, every mapped drive pointing at it flips to
 * "disconnected" and the This PC / Finder UI shows a red ✕. Local disk usage
 * reads from the workstation's own health telemetry.
 */

import type { InfrastructureState, MappedDrive, MappedDriveStatus, TargetNode } from "@/lib/core";

/** Resolve the live status of a mapped drive from the backing server node. */
export function resolveDriveStatus(infra: InfrastructureState, drive: MappedDrive): MappedDriveStatus {
  const server = findShareServer(infra, drive);
  if (!server) return "disconnected";
  if (!server.connection.online || !server.connection.reachable) return "disconnected";
  // SMB/Server service must be running for the share to serve files.
  if (server.os === "windows") {
    const smb = server.services["LanmanServer"];
    if (smb && smb.status !== "Running") return "disconnected";
  }
  // AD share permissions revoked → authenticated but access denied.
  if (infra.security.flaggedDomains?.length && drive.status === "auth_error") return "auth_error";
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
