"use client";

/**
 * The failure screen an admin console shows when its back end is gone.
 *
 * WHY THIS IS A SHARED COMPONENT. Every app that talks to a server can fail
 * for the same five reasons, and each one should read as a TRAIL rather than a
 * dead end: what is wrong, which layer it is on, and which app fixes it. A
 * bare "Domain Controller Unreachable" teaches nothing — the whole point of
 * the unification is that the operator can follow the fault down to the rack.
 *
 * SVG and CSS indicators only — no emoji.
 */

import type { ServiceReach, ReachLayer } from "@/lib/core";
import { IconAlert } from "@/components/ui/icons";

/** The chain, bottom-up. The failing link is highlighted in place. */
const CHAIN: { layer: ReachLayer; label: string; where: string }[] = [
  { layer: "physical", label: "Rack & power feed", where: "Datacenter Floor" },
  { layer: "power", label: "Chassis powered on", where: "Server Manager" },
  { layer: "network", label: "Top-of-rack uplink", where: "Datacenter Floor" },
  { layer: "service", label: "Service running on the host", where: "Remote Gateway" },
];

export default function ServiceDown({
  title,
  reach,
}: {
  /** e.g. "Domain Controller Unreachable". */
  title: string;
  reach: ServiceReach;
}) {
  const failedAt = CHAIN.findIndex((c) => c.layer === reach.layer);

  return (
    <div className="flex h-full items-center justify-center bg-panel p-6 text-gray-200">
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center gap-2">
          <IconAlert size={16} className="shrink-0 text-danger" />
          <h2 className="text-sm font-semibold text-danger">{title}</h2>
        </div>

        <p className="mb-1 text-[12px] leading-relaxed text-gray-200">{reach.reason}</p>
        {reach.remedy && <p className="mb-4 text-[12px] leading-relaxed text-gray-400">{reach.remedy}</p>}

        {reach.layer && reach.layer !== "missing" && (
          <div className="rounded-lg border border-edge bg-panelalt/60 p-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Dependency chain
            </h3>
            <ol className="space-y-1">
              {CHAIN.map((step, i) => {
                // Everything below the break is fine by definition — the check
                // stops at the first failure, so the trail reads bottom-up.
                const ok = failedAt >= 0 && i < failedAt;
                const broken = i === failedAt;
                return (
                  <li key={step.layer} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        broken ? "bg-danger" : ok ? "bg-emerald-400" : "bg-edge"
                      }`}
                    />
                    <span className={broken ? "text-danger" : ok ? "text-gray-300" : "text-gray-600"}>
                      {step.label}
                    </span>
                    {broken && (
                      <span className="ml-auto shrink-0 font-mono text-[9px] text-gray-500">{step.where}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-gray-600">
          This console reads the live estate. Fix the fault and it reconnects on its own — there is nothing to
          retry here.
        </p>
      </div>
    </div>
  );
}
