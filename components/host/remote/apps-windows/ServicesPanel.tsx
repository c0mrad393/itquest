"use client";

/**
 * Windows Services (services.msc)
 * -------------------------------
 * Start/Stop/Restart Windows services on the node. Mutations write to the
 * shared WindowsNodeState, so a service state change is visible everywhere.
 */

import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState, WindowsService } from "@/lib/core";

const STATUS_STYLE: Record<WindowsService["status"], string> = {
  Running: "bg-emerald-500/20 text-emerald-300",
  Stopped: "bg-gray-500/20 text-gray-400",
  Paused: "bg-amber-500/20 text-amber-300",
  StartPending: "bg-amber-500/20 text-amber-300",
  StopPending: "bg-amber-500/20 text-amber-300",
};

export default function ServicesPanel({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const control = useInfraStore((s) => s.controlWindowsService);
  if (!node) return null;

  const services = Object.values(node.services);

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <div className="grid grid-cols-[1fr_120px_110px_150px] gap-2 border-b border-edge bg-panelalt px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Name</span>
        <span>Status</span>
        <span>Startup</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="flex-1 overflow-y-auto term-scroll">
        {services.map((svc) => (
          <div
            key={svc.name}
            className="grid grid-cols-[1fr_120px_110px_150px] items-center gap-2 border-b border-edge/60 px-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-gray-100">{svc.displayName}</div>
              <div className="truncate font-mono text-[10px] text-gray-500">
                {svc.name}
                {svc.pid ? ` · PID ${svc.pid}` : ""}
              </div>
            </div>
            <span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[svc.status]}`}>
                {svc.status}
              </span>
            </span>
            <span className="text-[11px] text-gray-400">{svc.startupType}</span>
            <div className="flex justify-end gap-1">
              <SvcBtn
                disabled={svc.status === "Running"}
                onClick={() => control(nodeId, svc.name, "start")}
                tone="go"
              >
                Start
              </SvcBtn>
              <SvcBtn
                disabled={svc.status !== "Running"}
                onClick={() => control(nodeId, svc.name, "stop")}
                tone="stop"
              >
                Stop
              </SvcBtn>
              <SvcBtn onClick={() => control(nodeId, svc.name, "restart")} tone="neutral">
                ↻
              </SvcBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SvcBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "go" | "stop" | "neutral";
}) {
  const tones = {
    go: "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
    stop: "border-danger/40 text-danger hover:bg-danger/15",
    neutral: "border-edge text-gray-300 hover:bg-edge",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
