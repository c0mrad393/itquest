"use client";

/**
 * Control Panel → Network Adapters (GUI)
 * --------------------------------------
 * Toggles administrative up/down on interfaces in the shared VMState. A `ping`
 * in the terminal will immediately fail/succeed based on what you set here —
 * the classic NetOps "adapter was disabled" scenario, cross-workspace.
 */

import { useVMStore } from "@/lib/vm/store";

export default function NetworkApp() {
  const interfaces = useVMStore((s) => s.vm.network.interfaces);
  const dns = useVMStore((s) => s.vm.network.dnsServers);
  const setUp = useVMStore((s) => s.setInterfaceUp);

  return (
    <div className="p-3 text-sm">
      <div className="space-y-2">
        {interfaces.map((iface) => (
          <div
            key={iface.name}
            className="flex items-center gap-3 rounded border border-edge/60 bg-panelalt px-3 py-2"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-200">{iface.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    iface.up ? "bg-accent/20 text-accent" : "bg-gray-700/40 text-gray-500"
                  }`}
                >
                  {iface.up ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {iface.ipv4 ?? "no address"} · {iface.mac}
              </div>
            </div>

            {/* Toggle switch — lo cannot be disabled, like the real loopback. */}
            <button
              disabled={iface.name === "lo"}
              onClick={() => setUp(iface.name, !iface.up)}
              className={`relative h-6 w-11 rounded-full transition disabled:opacity-30 ${
                iface.up ? "bg-accent/70" : "bg-edge"
              }`}
              aria-label={`Toggle ${iface.name}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  iface.up ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded border border-edge/60 px-3 py-2 text-[11px] text-gray-500">
        <span className="uppercase tracking-wider text-gray-600">DNS Servers</span>
        <div className="mt-1 text-gray-300">{dns.join(", ")}</div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-gray-600">
        Equivalent CLI: <code className="text-info">ifconfig eth0 down</code> /{" "}
        <code className="text-info">ifconfig eth0 up</code>. Disable eth0, then run{" "}
        <code className="text-info">ping 1.1.1.1</code> in the terminal to see the
        shared state take effect.
      </p>
    </div>
  );
}
