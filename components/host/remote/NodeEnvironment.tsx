"use client";

/**
 * NodeEnvironment — OS dispatcher for a connected remote session.
 * -----------------------------------------------------------------------------
 * Windows workstation → immersive Win11 desktop (WindowsEndpointEnv).
 * Windows server / DC → full Windows Server 2022 desktop (WindowsServerEnv:
 *   taskbar, Server Manager, MMC-style ADUC, services.msc, Event Viewer, …).
 * macOS  → macOS endpoint desktop.  Linux → interactive terminal.
 */

import type { TargetNode } from "@/lib/core";
import NodeTerminal from "./apps-linux/NodeTerminal";
import MacOSEndpointEnv from "./endpoints/MacOSEndpointEnv";
import WindowsEndpointEnv from "./endpoints/WindowsEndpointEnv";
import WindowsServerEnv from "./server/WindowsServerEnv";

export default function NodeEnvironment({ node }: { node: TargetNode }) {
  if (node.os === "windows") {
    return node.role === "workstation" ? (
      <WindowsEndpointEnv nodeId={node.nodeId} />
    ) : (
      <WindowsServerEnv nodeId={node.nodeId} />
    );
  }
  if (node.os === "macos") return <MacOSEndpointEnv nodeId={node.nodeId} />;
  return <NodeTerminal nodeId={node.nodeId} />;
}
