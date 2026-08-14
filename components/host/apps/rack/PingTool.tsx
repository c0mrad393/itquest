"use client";

/**
 * PingTool — end-to-end reachability check across the rack's physical and
 * logical layers. It calls the same pure `pingCheck` the network ticket
 * win-conditions use, so a green result here means the ticket will grade.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useSelectedRack } from "./rack-context";
import { isPowered, uplinkOf } from "@/lib/core";
import { IconActivity, IconAlert, IconCheck, IconX } from "@/components/ui/icons";

export default function PingTool() {
  const { rackId, rack } = useSelectedRack();
  const runPing = useInfraStore((s) => s.rackRunPing);

  const hosts = rack.devices.filter((d) => d.kind === "server");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="p-3 text-xs">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Connectivity test</div>

      {hosts.length < 2 ? (
        <p className="py-3 text-[11px] leading-relaxed text-gray-600">
          Mount and configure at least two servers to run a ping test between them.
        </p>
      ) : (
        <>
          <select value={from} onChange={(e) => setFrom(e.target.value)}
            className="mb-1 w-full rounded border border-edge bg-panelalt px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-info">
            <option value="">— source —</option>
            {hosts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.serverConfig?.ipv4 ? ` (${d.serverConfig.ipv4})` : ""}</option>)}
          </select>
          <select value={to} onChange={(e) => setTo(e.target.value)}
            className="mb-2 w-full rounded border border-edge bg-panelalt px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-info">
            <option value="">— destination —</option>
            {hosts.filter((d) => d.id !== from).map((d) => <option key={d.id} value={d.id}>{d.name}{d.serverConfig?.ipv4 ? ` (${d.serverConfig.ipv4})` : ""}</option>)}
          </select>
          <button onClick={() => from && to && runPing(rackId, from, to)} disabled={!from || !to}
            className="flex w-full items-center justify-center gap-1.5 rounded bg-info px-2 py-1.5 text-[11px] font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500">
            <IconActivity size={12} /> Run ping test
          </button>
        </>
      )}

      {/* Readiness summary — why a test might fail before you run it */}
      <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rack readiness</div>
      {rack.devices.length === 0 && <p className="text-[10px] text-gray-600">Nothing mounted yet.</p>}
      {rack.devices.map((d) => {
        const pwr = isPowered(rack, d.id);
        const link = uplinkOf(rack, d.id);
        const needsLink = d.kind === "server";
        return (
          <div key={d.id} className="mb-0.5 flex items-center gap-1.5 text-[10px]">
            <span className={pwr ? "text-emerald-400" : "text-danger"}>{pwr ? <IconCheck size={10} /> : <IconX size={10} />}</span>
            <span className="min-w-0 flex-1 truncate text-gray-300">{d.name}</span>
            <span className={`font-mono ${pwr ? "text-gray-500" : "text-danger"}`}>{pwr ? "pwr" : "no pwr"}</span>
            {needsLink && <span className={`font-mono ${link ? "text-gray-500" : "text-amber-300"}`}>{link ? link.port : "unpatched"}</span>}
          </div>
        );
      })}

      <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Output</div>
      <div className="rounded border border-edge bg-sunken/70 p-2 font-mono text-[10px] leading-relaxed">
        {rack.tests.length === 0 && <span className="text-gray-600">No tests run yet.</span>}
        {rack.tests.map((t) => (
          <div key={t.id} className="mb-1.5">
            <div className="text-gray-500">$ ping {t.toName} <span className="text-gray-700">from {t.fromName}</span></div>
            <div className={t.ok ? "text-emerald-300" : "text-danger"}>
              {t.ok ? <IconCheck size={10} className="inline" /> : <IconAlert size={10} className="inline" />} {t.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
