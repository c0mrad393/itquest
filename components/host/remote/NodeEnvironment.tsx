"use client";

/**
 * NodeEnvironment — OS dispatcher for a connected remote session (Phase 4: live)
 * -----------------------------------------------------------------------------
 * Linux  → interactive terminal bound to the node (NodeTerminal).
 * Windows→ a console launcher; selecting a console opens its interactive panel
 *          (ADUC / services.msc / Control Panel / Event Viewer / File Explorer),
 *          all mutating the shared node in InfrastructureState.
 */

import { useState } from "react";
import type { TargetNode, WindowsNodeState } from "@/lib/core";
import NodeTerminal from "./apps-linux/NodeTerminal";
import ADUCPanel from "./apps-windows/ADUCPanel";
import ServicesPanel from "./apps-windows/ServicesPanel";
import ControlPanel from "./apps-windows/ControlPanel";
import EventViewer from "./apps-windows/EventViewer";
import FileExplorer from "./apps-windows/FileExplorer";

export default function NodeEnvironment({ node }: { node: TargetNode }) {
  return node.os === "windows" ? (
    <WindowsEnvironment node={node} />
  ) : (
    <NodeTerminal nodeId={node.nodeId} />
  );
}

type ConsoleId = "aduc" | "gpmc" | "services" | "controlpanel" | "eventvwr" | "explorer";

interface ConsoleDef {
  id: ConsoleId;
  label: string;
  icon: string;
  available: (n: WindowsNodeState) => boolean;
  render: (nodeId: string) => React.ReactNode;
}

const CONSOLES: ConsoleDef[] = [
  { id: "aduc", label: "AD Users & Computers", icon: "👥", available: (n) => !!n.activeDirectory, render: (id) => <ADUCPanel nodeId={id} /> },
  { id: "gpmc", label: "Group Policy Mgmt", icon: "📜", available: (n) => !!n.groupPolicy, render: () => <ComingSoon name="Group Policy Management" /> },
  { id: "services", label: "Services (services.msc)", icon: "⚙️", available: () => true, render: (id) => <ServicesPanel nodeId={id} /> },
  { id: "controlpanel", label: "Control Panel", icon: "🎛️", available: () => true, render: (id) => <ControlPanel nodeId={id} /> },
  { id: "eventvwr", label: "Event Viewer", icon: "📑", available: () => true, render: (id) => <EventViewer nodeId={id} /> },
  { id: "explorer", label: "File Explorer", icon: "🗂️", available: () => true, render: (id) => <FileExplorer nodeId={id} /> },
];

function WindowsEnvironment({ node }: { node: WindowsNodeState }) {
  const [active, setActive] = useState<ConsoleId | null>(null);
  const consoles = CONSOLES.filter((c) => c.available(node));
  const activeConsole = consoles.find((c) => c.id === active) ?? null;

  if (activeConsole) {
    return (
      <div className="flex h-full flex-col bg-panel">
        {/* Console header / back to desktop */}
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-xs">
          <button
            onClick={() => setActive(null)}
            className="rounded border border-edge px-2 py-0.5 text-gray-300 hover:bg-edge"
          >
            ← Desktop
          </button>
          <span className="text-sm">{activeConsole.icon}</span>
          <span className="font-semibold text-gray-200">{activeConsole.label}</span>
          <span className="ml-auto font-mono text-[10px] text-gray-500">{node.hostname}</span>
        </div>
        <div className="min-h-0 flex-1">{activeConsole.render(node.nodeId)}</div>
      </div>
    );
  }

  const runningServices = Object.values(node.services).filter((s) => s.status === "Running").length;

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-[#0a1c3a] to-[#0d1a2e] p-6">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[7vw] font-black text-white/[0.03]">{node.hostname}</span>
      </div>

      <div className="relative mx-auto w-full max-w-2xl">
        <div className="mb-4 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🪟</span>
            <div>
              <div className="text-sm font-semibold text-gray-100">{node.hostname}</div>
              <div className="text-[11px] text-gray-400">
                {node.edition} · Build {node.build}
                {node.isDomainController ? " · Domain Controller" : ""}
              </div>
            </div>
            <div className="ml-auto text-right text-[11px] text-gray-400">
              <div>{node.domain}</div>
              <div className="text-emerald-300">{runningServices} services running</div>
            </div>
          </div>
        </div>

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Management consoles
        </div>
        <div className="grid grid-cols-3 gap-2">
          {consoles.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 p-3 text-center transition hover:border-info/40 hover:bg-info/10"
            >
              <span className="text-xl">{c.icon}</span>
              <span className="text-[10px] leading-tight text-gray-200">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel text-center">
      <div className="text-3xl">📜</div>
      <div className="text-sm text-gray-200">{name}</div>
      <div className="text-[11px] text-gray-500">
        GPO editing surfaces in a later content pass. Policy state is already live in the node.
      </div>
    </div>
  );
}
