"use client";

/**
 * ServerConfigModal — logical layer for a racked server: static addressing and
 * mock services. Writes straight into InfrastructureState so the ping tool and
 * ticket win-conditions see the change immediately.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { isPowered, isValidIpv4, uplinkOf } from "@/lib/core";
import { IconAlert, IconCheck, IconLink, IconPower } from "@/components/ui/icons";

export default function ServerConfigModal({ deviceId }: { deviceId: string }) {
  const rack = useInfraStore((s) => s.infra.rack);
  const device = rack.devices.find((d) => d.id === deviceId);
  const update = useInfraStore((s) => s.rackUpdateServer);

  const cfg = device?.serverConfig;
  const [hostname, setHostname] = useState(cfg?.hostname ?? "");
  const [ipv4, setIpv4] = useState(cfg?.ipv4 ?? "");
  const [netmask, setNetmask] = useState(cfg?.netmask ?? "255.255.255.0");
  const [gateway, setGateway] = useState(cfg?.gateway ?? "");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!device || !cfg) return <div className="p-4 text-xs text-gray-500">This device has no system console.</div>;

  const powered = isPowered(rack, device.id);
  const link = uplinkOf(rack, device.id);

  function apply() {
    if (ipv4 && !isValidIpv4(ipv4)) { setErr("IPv4 address is not valid."); return; }
    if (netmask && !isValidIpv4(netmask)) { setErr("Subnet mask is not valid."); return; }
    if (gateway && !isValidIpv4(gateway)) { setErr("Default gateway is not valid."); return; }
    update(deviceId, { hostname: hostname.trim() || cfg!.hostname, ipv4: ipv4.trim(), netmask: netmask.trim(), gateway: gateway.trim() });
    setErr(null); setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function toggleService(key: "web" | "dns") {
    update(deviceId, { services: { ...cfg!.services, [key]: !cfg!.services[key] } });
  }

  return (
    <div className="max-h-[420px] overflow-y-auto p-4 text-xs">
      {/* Status strip */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-edge bg-panelalt/60 px-3 py-2 text-[11px]">
        <span className={`flex items-center gap-1 ${powered ? "text-emerald-300" : "text-danger"}`}>
          <IconPower size={12} /> {powered ? "Powered" : "No power"}
        </span>
        <span className={`flex items-center gap-1 ${link ? "text-info" : "text-gray-500"}`}>
          <IconLink size={12} /> {link ? `patched → ${link.port}` : "not patched"}
        </span>
        <span className="ml-auto font-mono text-gray-500">U{device.uStart} · {device.uSize}U</span>
      </div>

      {!powered && (
        <div className="mb-3 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          <IconAlert size={12} /> The OS is offline until this server is connected to the UPS/PDU.
        </div>
      )}

      <SectionTitle>Network adapter (eth0)</SectionTitle>
      <div className="space-y-2">
        <Row label="Hostname"><Input value={hostname} onChange={(v) => { setHostname(v); setErr(null); }} placeholder="srv-web-01" /></Row>
        <Row label="IPv4 address"><Input value={ipv4} onChange={(v) => { setIpv4(v); setErr(null); }} placeholder="10.20.30.10" mono /></Row>
        <Row label="Subnet mask"><Input value={netmask} onChange={(v) => { setNetmask(v); setErr(null); }} placeholder="255.255.255.0" mono /></Row>
        <Row label="Default gateway"><Input value={gateway} onChange={(v) => { setGateway(v); setErr(null); }} placeholder="10.20.30.1" mono /></Row>
      </div>

      {err && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-danger"><IconAlert size={12} /> {err}</div>}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={apply} className="flex items-center gap-1 rounded bg-info px-3 py-1 text-[11px] font-semibold text-black hover:brightness-110">
          <IconCheck size={12} /> Apply configuration
        </button>
        {saved && <span className="text-[11px] text-emerald-300">Configuration applied</span>}
      </div>

      <SectionTitle className="mt-5">Services</SectionTitle>
      <div className="space-y-1.5">
        <ServiceRow label="Web server (nginx)" desc="Serves HTTP on :80" on={cfg.services.web} onToggle={() => toggleService("web")} />
        <ServiceRow label="DNS resolver (bind)" desc="Answers queries on :53" on={cfg.services.dns} onToggle={() => toggleService("dns")} />
      </div>
    </div>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${className}`}>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-2"><span className="w-28 shrink-0 text-gray-400">{label}</span>{children}</div>;
}
function Input({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`min-w-0 flex-1 rounded border border-edge bg-panelalt px-2 py-1 text-gray-100 outline-none placeholder:text-gray-600 focus:border-info ${mono ? "font-mono" : ""}`} />
  );
}
function ServiceRow({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded border border-edge bg-panelalt/60 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-gray-100">{label}</span>
        <span className="block text-[10px] text-gray-500">{desc}</span>
      </span>
      <span className={`text-[10px] ${on ? "text-emerald-300" : "text-gray-500"}`}>{on ? "running" : "stopped"}</span>
      <button onClick={onToggle} aria-label={`Toggle ${label}`}
        className={`relative h-5 w-9 rounded-full transition ${on ? "bg-emerald-500/70" : "bg-edge"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
