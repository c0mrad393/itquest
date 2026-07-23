"use client";

/**
 * LinuxSSHEnv — pure CLI endpoint (remote SSH session)
 * ----------------------------------------------------
 * Linux nodes (servers / routers) get a strictly terminal interface — no GUI.
 * The terminal is bound to useInfraStore.runLinuxCommand(nodeId, …), i.e. the
 * Phase-1 interpreter executing against THIS node's slice of the shared
 * InfrastructureState, so `systemctl start app` here resolves the same ticket
 * a GUI fix would.
 */

import { useInfraStore } from "@/lib/infra/store";
import type { LinuxNodeState } from "@/lib/core";
import NodeTerminal from "../apps-linux/NodeTerminal";

export default function LinuxSSHEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as LinuxNodeState | undefined;
  if (!node) return null;

  const failed = Object.values(node.services).filter((s) => s.status === "failed").length;

  return (
    <div className="flex h-full flex-col bg-term">
      {/* SSH session banner */}
      <div className="shrink-0 border-b border-edge/60 px-4 pt-3 font-mono text-[12px] leading-relaxed">
        <div className="text-gray-500">
          Last login: {new Date().toUTCString()} from {node.connection.ip}
        </div>
        <div className="text-gray-400">
          {node.distro} (GNU/Linux {node.kernel} x86_64)
        </div>
        <div className="text-gray-500">
          Load {(node.health.cpuLoad / 100).toFixed(2)} · Mem {node.health.memUsedPct}% · Disk{" "}
          {node.health.diskUsedPct}%
        </div>
        {failed > 0 && (
          <div className="text-danger">⚠ {failed} service(s) failed — run `systemctl --failed`.</div>
        )}
      </div>

      {/* Live interpreter-bound terminal */}
      <div className="min-h-0 flex-1">
        <NodeTerminal nodeId={nodeId} />
      </div>
    </div>
  );
}
