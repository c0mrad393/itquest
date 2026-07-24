/**
 * TriageOS — macOS node model
 * ===========================
 * Client Macs in the generated fleet. Deliberately lighter than the Windows
 * model: enough state to drive the endpoint environment's Activity Monitor
 * (process table) and System Settings (Wi-Fi / network), all of which mutate
 * the shared InfrastructureState like every other surface.
 */

import type { BaseNode } from "./nodes";
import type { FsNode, ProcessInfo } from "@/lib/vm/types";
import type { EndpointVisualState, MappedDrive } from "./endpoint";

export interface MacLocalUser {
  name: string; // short name, e.g. "e.ali"
  fullName: string;
  admin: boolean;
}

export interface MacNodeState extends BaseNode {
  os: "macos";
  productName: string; // "macOS 14 Sonoma"
  build: string; // "23F79"
  filesystem: FsNode;
  /** Live process table — Activity Monitor force-quits from here. */
  processes: ProcessInfo[];
  localUsers: MacLocalUser[];
  /** Wi-Fi radio state (System Settings toggle). */
  wifiEnabled: boolean;
  /** FileVault / firewall flags surfaced in System Settings. */
  firewallEnabled: boolean;
  /** Procedural presentation (wallpaper/theme/desktop). */
  visualState?: EndpointVisualState;
  /** Mounted network shares (Finder → Shared / Locations). */
  mappedDrives?: MappedDrive[];
  nextPid: number;
}
