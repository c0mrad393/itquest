"use client";

/**
 * Windows Control Panel — Network & Firewall
 * ------------------------------------------
 * Toggle network adapters and Windows Defender Firewall profiles on the node.
 * Mutations land in the shared WindowsNodeState.
 */

import { useInfraStore } from "@/lib/infra/store";
import type { FirewallProfile, WindowsNodeState } from "@/lib/core";

const PROFILES: FirewallProfile[] = ["Domain", "Private", "Public"];

export default function ControlPanel({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const setIface = useInfraStore((s) => s.setWinInterfaceUp);
  const setProfile = useInfraStore((s) => s.setFirewallProfile);
  if (!node) return null;

  return (
    <div className="h-full space-y-5 overflow-y-auto term-scroll bg-panel p-4 text-sm text-gray-200">
      <Section title="Network Adapters">
        {node.network.interfaces.map((nic) => (
          <div key={nic.name} className="flex items-center gap-3 rounded border border-edge/60 bg-panelalt px-3 py-2">
            <span className="text-lg">🖧</span>
            <div className="flex-1">
              <div className="text-gray-100">{nic.name}</div>
              <div className="font-mono text-[11px] text-gray-500">
                {nic.ipv4 ?? "no address"} · {nic.mac}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                nic.up ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"
              }`}
            >
              {nic.up ? "Enabled" : "Disabled"}
            </span>
            <Toggle on={nic.up} onClick={() => setIface(nodeId, nic.name, !nic.up)} />
          </div>
        ))}
      </Section>

      <Section title="Windows Defender Firewall">
        <div className="grid grid-cols-3 gap-2">
          {PROFILES.map((p) => {
            const on = node.firewall.profiles[p].enabled;
            return (
              <div key={p} className="rounded border border-edge/60 bg-panelalt px-3 py-2 text-center">
                <div className="text-[11px] text-gray-400">{p}</div>
                <div className={`my-1 text-xs font-semibold ${on ? "text-emerald-300" : "text-danger"}`}>
                  {on ? "On" : "Off"}
                </div>
                <Toggle on={on} onClick={() => setProfile(nodeId, p, !on)} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 rounded border border-edge/60 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Inbound rules</div>
          {node.firewall.rules.map((r) => (
            <div key={r.name} className="flex items-center gap-2 py-0.5 text-[11px]">
              <span className={r.action === "Allow" ? "text-emerald-300" : "text-danger"}>
                {r.action === "Allow" ? "✓" : "✕"}
              </span>
              <span className="text-gray-300">{r.name}</span>
              <span className="ml-auto font-mono text-gray-500">
                {r.protocol}/{r.localPort}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500/70" : "bg-edge"}`}
      aria-label="Toggle"
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}
