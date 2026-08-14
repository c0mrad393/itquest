"use client";

/**
 * NodeEnvironment — OS dispatcher for a connected remote session.
 * -----------------------------------------------------------------------------
 * Windows workstation → immersive Win11 desktop (WindowsEndpointEnv).
 * Windows server / DC → Windows Admin Center: one sidebar-navigated console
 *   per host (System Status, Enterprise Directory Services, File Shares, Services, Events).
 *   It replaced a nested Server DESKTOP — a second taskbar and eight draggable
 *   sub-windows inside a window that was already inside a window.
 * macOS  → macOS endpoint desktop.  Linux → interactive terminal.
 */

import type { TargetNode } from "@/lib/core";
import NodeTerminal from "./apps-linux/NodeTerminal";
import MacOSEndpointEnv from "./endpoints/MacOSEndpointEnv";
import WindowsEndpointEnv from "./endpoints/WindowsEndpointEnv";
import AdminCenter from "./server/AdminCenter";

export default function NodeEnvironment({ node }: { node: TargetNode }) {
  if (node.os === "windows") {
    return node.role === "workstation" ? (
      <WindowsEndpointEnv nodeId={node.nodeId} />
    ) : (
      <AdminCenter nodeId={node.nodeId} />
    );
  }
  if (node.os === "macos") return <MacOSEndpointEnv nodeId={node.nodeId} />;
  return <NodeTerminal nodeId={node.nodeId} />;
}
