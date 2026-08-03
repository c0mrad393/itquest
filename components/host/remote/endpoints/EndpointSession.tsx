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
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-black text-center">
        <div className="text-3xl"><AppIcon id="plug" size={28} /></div>
        <div className="text-sm text-danger">Endpoint not found.</div>
        <button onClick={onDisconnect} className="rounded border border-edge px-3 py-1 text-xs text-gray-200 hover:bg-panelalt">Back</button>
      </div>
    );
  }

  const meta = OS_META[node.os];

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/60 px-3 py-1 text-[11px] text-gray-300">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="uppercase tracking-wider">{meta.protocol}</span>
        <span className="text-gray-500">·</span>
        <span className="font-mono">{node.connection.ip}:{node.connection.port}</span>
        <span className="text-gray-500">·</span>
        <span className="inline-flex items-center gap-1.5"><AppIcon id={meta.icon} size={12} /> {node.hostname}</span>
        <span className="ml-auto text-gray-400">Connected</span>
        <button
          onClick={onDisconnect}
          className="ml-2 rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-danger hover:text-white"
        >
          Disconnect
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {node.os === "windows" ? (
          <WindowsEndpointEnv nodeId={nodeId} />
        ) : node.os === "macos" ? (
          <MacOSEndpointEnv nodeId={nodeId} />
        ) : (
          <LinuxSSHEnv nodeId={nodeId} />
        )}
      </div>
    </div>
  );
}
