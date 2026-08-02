"use client";

/**
 * SwitchCli — Cisco-style console for a racked switch / router.
 * Supported: enable · configure terminal · vlan <id> · interface <if> ·
 * switchport access vlan <id> · shutdown / no shutdown · description ·
 * hostname · exit / end · show ip interface brief · show vlan brief ·
 * show running-config · write memory · ?
 *
 * Every config command writes straight through to InfrastructureState, so the
 * ping tool and ticket win-conditions observe it immediately.
 */

import { useEffect, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";

type Mode = "user" | "priv" | "config" | "config-if" | "config-vlan";

export default function SwitchCli({ deviceId }: { deviceId: string }) {
  const device = useInfraStore((s) => s.infra.rack.devices.find((d) => d.id === deviceId));
  const update = useInfraStore((s) => s.rackUpdateSwitch);

  const [mode, setMode] = useState<Mode>("user");
  const [ctxIf, setCtxIf] = useState<string | null>(null);
  const [ctxVlan, setCtxVlan] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>([
    "Console session established.",
    "Press RETURN to get started.",
    "",
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lines]);

  if (!device || !device.switchConfig) {
    return <div className="p-4 text-xs text-gray-500">This device has no console.</div>;
  }
  const cfg = device.switchConfig;
  const host = cfg.hostname;

  const prompt =
    mode === "user" ? `${host}>` :
    mode === "priv" ? `${host}#` :
    mode === "config" ? `${host}(config)#` :
    mode === "config-if" ? `${host}(config-if)#` :
    `${host}(config-vlan)#`;

  function out(...l: string[]) { setLines((prev) => [...prev, ...l]); }

  function run(raw: string) {
    const cmd = raw.trim();
    out(`${prompt} ${cmd}`);
    if (!cmd) return;
    const t = cmd.split(/\s+/);
    const lc = cmd.toLowerCase();

    // ── help ──
    if (cmd === "?") {
      out(mode === "user" ? "  enable        Turn on privileged commands" :
        mode === "priv" ? "  configure terminal   Enter configuration mode\n  show ...             Display information\n  write memory         Save config" :
        "  vlan <id> · interface <if> · hostname <n> · exit / end");
      return;
    }

    // ── mode movement ──
    if (lc === "enable" || lc === "en") {
      if (mode === "user") setMode("priv"); else out("% Already privileged.");
      return;
    }
    if (lc === "disable") { setMode("user"); return; }
    if (lc === "configure terminal" || lc === "conf t" || lc === "config t") {
      if (mode !== "priv") { out("% Invalid input detected — run 'enable' first."); return; }
      setMode("config");
      out("Enter configuration commands, one per line. End with CNTL/Z.");
      return;
    }
    if (lc === "end") { setMode(mode === "user" ? "user" : "priv"); setCtxIf(null); setCtxVlan(null); return; }
    if (lc === "exit") {
      if (mode === "config-if" || mode === "config-vlan") { setMode("config"); setCtxIf(null); setCtxVlan(null); }
      else if (mode === "config") setMode("priv");
      else if (mode === "priv") setMode("user");
      return;
    }

    // ── show commands (privileged or config) ──
    if (lc.startsWith("show ")) {
      if (mode === "user") { out("% Invalid input detected — run 'enable' first."); return; }
      if (lc.startsWith("show ip int")) {
        out("Interface              IP-Address      OK? Method Status                Protocol");
        for (const i of cfg.interfaces) {
          out(
            `${i.name.padEnd(22)} unassigned      YES unset  ${(i.up ? "up" : "administratively down").padEnd(21)} ${i.up ? "up" : "down"}`,
          );
        }
        return;
      }
      if (lc.startsWith("show vlan")) {
        out("VLAN Name                             Status    Ports");
        out("---- -------------------------------- --------- -------------------------------");
        for (const v of [...cfg.vlans].sort((a, b) => a - b)) {
          const ports = cfg.interfaces.filter((i) => (i.accessVlan ?? 1) === v).map((i) => i.name).join(", ");
          const name = v === 1 ? "default" : `VLAN${String(v).padStart(4, "0")}`;
          out(`${String(v).padEnd(4)} ${name.padEnd(32)} active    ${ports}`);
        }
        return;
      }
      if (lc.startsWith("show run")) {
        out(`hostname ${host}`, "!");
        for (const v of cfg.vlans.filter((v) => v !== 1)) out(`vlan ${v}`, "!");
        for (const i of cfg.interfaces) {
          out(`interface ${i.name}`);
          if (i.description) out(` description ${i.description}`);
          if (i.accessVlan !== null) out(` switchport mode access`, ` switchport access vlan ${i.accessVlan}`);
          if (!i.up) out(" shutdown");
          out("!");
        }
        return;
      }
      out("% Unsupported show command in this simulator.");
      return;
    }

    if (lc === "write memory" || lc === "wr" || lc === "copy run start") {
      if (mode === "user") { out("% Invalid input detected."); return; }
      out("Building configuration...", "[OK]");
      return;
    }

    // ── config mode ──
    if (mode === "config" || mode === "config-if" || mode === "config-vlan") {
      if (t[0]?.toLowerCase() === "hostname" && t[1]) { update(deviceId, { hostname: t[1] }); return; }

      if (t[0]?.toLowerCase() === "vlan" && t[1]) {
        const id = Number(t[1]);
        if (!Number.isInteger(id) || id < 1 || id > 4094) { out("% Invalid VLAN id."); return; }
        if (!cfg.vlans.includes(id)) update(deviceId, { vlans: [...cfg.vlans, id] });
        setMode("config-vlan"); setCtxVlan(id);
        return;
      }

      if (t[0]?.toLowerCase() === "interface" && t[1]) {
        const name = t.slice(1).join("").toLowerCase().replace("gigabitethernet", "gi");
        const iface = cfg.interfaces.find((i) => i.name.toLowerCase() === name);
        if (!iface) { out(`% Invalid interface — try one of: ${cfg.interfaces.map((i) => i.name).join(", ")}`); return; }
        setMode("config-if"); setCtxIf(iface.name);
        return;
      }

      if (mode === "config-if" && ctxIf) {
        const patchIf = (fn: (i: typeof cfg.interfaces[number]) => typeof cfg.interfaces[number]) =>
          update(deviceId, { interfaces: cfg.interfaces.map((i) => (i.name === ctxIf ? fn(i) : i)) });

        if (lc.startsWith("switchport access vlan")) {
          const id = Number(t[3]);
          if (!Number.isInteger(id)) { out("% Invalid VLAN id."); return; }
          if (!cfg.vlans.includes(id)) {
            out(`% Access VLAN does not exist. Creating vlan ${id}`);
            update(deviceId, { vlans: [...cfg.vlans, id], interfaces: cfg.interfaces.map((i) => (i.name === ctxIf ? { ...i, accessVlan: id } : i)) });
            return;
          }
          patchIf((i) => ({ ...i, accessVlan: id }));
          return;
        }
        if (lc === "switchport mode access") return; // accepted, no-op in this model
        if (lc === "no switchport access vlan") { patchIf((i) => ({ ...i, accessVlan: null })); return; }
        if (lc === "shutdown") { patchIf((i) => ({ ...i, up: false })); return; }
        if (lc === "no shutdown") { patchIf((i) => ({ ...i, up: true })); return; }
        if (t[0]?.toLowerCase() === "description") { patchIf((i) => ({ ...i, description: t.slice(1).join(" ") })); return; }
      }

      if (mode === "config-vlan" && ctxVlan !== null) {
        if (t[0]?.toLowerCase() === "name") return; // accepted
      }

      out("% Invalid input detected at '^' marker.");
      return;
    }

    out("% Invalid input detected at '^' marker.");
  }

  return (
    <div className="flex h-[340px] flex-col bg-black font-mono text-[12px] text-emerald-300">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 leading-relaxed">
        {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        <div ref={endRef} />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-emerald-900/60 px-3 py-2">
        <span className="shrink-0 text-emerald-500">{prompt}</span>
        <input
          autoFocus value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { run(input); setInput(""); } }}
          className="min-w-0 flex-1 bg-transparent text-emerald-200 outline-none"
          spellCheck={false}
        />
      </div>
      <div className="shrink-0 border-t border-emerald-900/60 px-3 py-1 text-[10px] text-emerald-700">
        try: enable · conf t · vlan 10 · interface gi0/1 · switchport access vlan 10 · show ip int brief
      </div>
    </div>
  );
}
