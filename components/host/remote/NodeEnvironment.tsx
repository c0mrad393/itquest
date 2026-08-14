"use client";

/**
 * NodeEnvironment — OS dispatcher for a connected remote session.
 * -----------------------------------------------------------------------------
 * ServerOS workstation → immersive DeskOS endpoint desktop.
 * ServerOS server / DC → the ServerOS DESKTOP: wallpaper, taskbar and start
 *   menu, from which the operator launches the Admin Center. v0.7.0 opened the
 *   Admin Center straight into the session, which was tidier and wrong —
 *   anyone who has administered a real server expects to land on a desktop and
 *   open a tool, and skipping that taught that servers are consoles rather
 *   than computers.
 * macOS  → macOS endpoint desktop.  Linux → interactive terminal.
 */

import type { TargetNode } from "@/lib/core";
import NodeTerminal from "./apps-linux/NodeTerminal";
import MacOSEndpointEnv from "./endpoints/MacOSEndpointEnv";
import WindowsEndpointEnv from "./endpoints/WindowsEndpointEnv";
import ServerOsDesktop from "./server/ServerOsDesktop";

export default function NodeEnvironment({ node }: { node: TargetNode }) {
  if (node.os === "windows") {
    return node.role === "workstation" ? (
      <WindowsEndpointEnv nodeId={node.nodeId} />
    ) : (
      <ServerOsDesktop nodeId={node.nodeId} />
    );
  }
  if (node.os === "macos") return <MacOSEndpointEnv nodeId={node.nodeId} />;
  return <NodeTerminal nodeId={node.nodeId} />;
}
