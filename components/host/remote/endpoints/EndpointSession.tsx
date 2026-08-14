"use client";

/**
 * EndpointSession — a live remote session to one endpoint, dispatched by OS.
 * Rendered when the operator hits "Remote Connect" on an AD object. Shows a
 * session bar (protocol / IP / disconnect) over the correct mini-OS:
 *   windows → WindowsEndpointEnv (RDP)
 *   macos   → MacOSEndpointEnv   (RDP)
 *   linux   → LinuxSSHEnv        (SSH)
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import WindowsEndpointEnv from "./WindowsEndpointEnv";
import MacOSEndpointEnv from "./MacOSEndpointEnv";
import LinuxSSHEnv from "./LinuxSSHEnv";
import { AppIcon } from "@/components/ui/app-icons";
import { RemoteConnectionBanner, RemoteSurface } from "../RemoteChrome";

const OS_META = {
  windows: { protocol: "RDP", icon: "os-windows" },
  macos: { protocol: "RDP", icon: "os-macos" },
  linux: { protocol: "SSH", icon: "os-linux" },
} as const;

export default function EndpointSession({
  nodeId,
  onDisconnect,
}: {
  nodeId: string;
  onDisconnect: () => void;
}) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]);
  const authenticate = useInfraStore((s) => s.authenticate);

  useEffect(() => {
    authenticate(nodeId, true);
    return () => authenticate(nodeId, false);
  }, [nodeId, authenticate]);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-sunken text-center">
        <div className="text-3xl"><AppIcon id="plug" size={28} /></div>
        <div className="text-sm text-danger">Endpoint not found.</div>
        <button onClick={onDisconnect} className="rounded border border-edge px-3 py-1 text-xs text-gray-200 hover:bg-panelalt">Back</button>
      </div>
    );
  }

  const meta = OS_META[node.os];

  return (
    <div className="flex h-full flex-col bg-remote-tint">
      {/* Same banner the server sessions use. A DeskOS session is every bit as
          much "somebody else's computer" as a ServerOS one, and the whole point
          of the marker is that it is identical wherever you cross the boundary. */}
      <RemoteConnectionBanner
        hostname={node.hostname}
        ip={node.connection.ip}
        port={node.connection.port}
        protocol={meta.protocol}
        latencyMs={node.connection.latencyMs}
        kind="endpoint"
        onDisconnect={onDisconnect}
      />
      <RemoteSurface>
        {node.os === "windows" ? (
          <WindowsEndpointEnv nodeId={nodeId} />
        ) : node.os === "macos" ? (
          <MacOSEndpointEnv nodeId={nodeId} />
        ) : (
          <LinuxSSHEnv nodeId={nodeId} />
        )}
      </RemoteSurface>
    </div>
  );
}
