"use client";

/**
 * AetherCloud Engine (ACE) — hybrid cloud console.
 * ================================================
 * Five tabs over one authoritative slice of InfrastructureState (`infra.cloud`):
 *
 *   Overview   estate summary + FinOps burn breakdown
 *   Compute    vNodes and DataBuckets
 *   Network    AVNs, the IPsec site-to-site tunnel, and a live route test
 *   Traffic    Aether Traffic Routers (cloud burst / failover)
 *   AetherTrace audit log
 *
 * Because cloud state lives in `infra`, the TicketReconciler re-evaluates
 * win-conditions on every change here — building the right topology resolves
 * the hybrid tickets the moment it is correct, with no explicit "submit".
 *
 * The route test calls the same `hybridRoute()` the VPN ticket is graded on, so
 * what the operator sees in this UI is exactly what counts.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import {
  BUCKET_TIERS,
  VNODE_SIZES,
  burnRate,
  hybridRoute,
  exposedAdminRules,
  sizeSpec,
  type AuditSeverity,
  type VNodeSize,
} from "@/lib/core";
import { BUDGET_ALLOWANCE } from "@/lib/scenario/scoring";
import { AppIcon } from "@/components/ui/app-icons";
import { AppHeader, CountPill, Segmented } from "./AppChrome";
import { playCue } from "@/lib/audio/engine";
import { hasLicense } from "@/lib/economy/licenses";
import EmptyState from "@/components/ui/EmptyState";
import { IconList } from "@/components/ui/icons";
import { useArmed } from "@/components/ui/useArmed";

type Tab = "overview" | "compute" | "network" | "traffic" | "trace";

export default function AetherConsole() {
  const infra = useInfraStore((s) => s.infra);
  const operator = useHostStore((s) => s.host.user.displayName);
  const [tab, setTab] = useState<Tab>("overview");

  const cloud = infra.cloud;
  const burn = burnRate(cloud);
  const exposed = exposedAdminRules(cloud);

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="cloud" title="AetherCloud" subtitle={cloud.tenant}>
        <BurnMeter burn={burn} />
        {exposed.length > 0 && <CountPill value={exposed.length} label="exposed" tone="warn" />}
        <TunnelPill status={cloud.vpn.status} />
      </AppHeader>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-edge px-3.5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview" as const, label: "Overview" },
            { value: "compute" as const, label: "Compute" },
            { value: "network" as const, label: "Network" },
            { value: "traffic" as const, label: "Traffic" },
            { value: "trace" as const, label: "AetherTrace" },
          ]}
        />
      </div>

      <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" && <Overview burn={burn} operator={operator} />}
        {tab === "compute" && <Compute operator={operator} />}
        {tab === "network" && <Network operator={operator} />}
        {tab === "traffic" && <Traffic operator={operator} />}
        {tab === "trace" && <Trace />}
      </div>
    </div>
  );
}

// ── Header widgets ──────────────────────────────────────────────────────────

function BurnMeter({ burn }: { burn: number }) {
  const over = burn > BUDGET_ALLOWANCE;
  const pct = Math.min(100, (burn / (BUDGET_ALLOWANCE * 2)) * 100);
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-edge bg-panel px-2 py-1"
      title={`Hourly burn rate — the desk's allowance is ${BUDGET_ALLOWANCE} credits/hour. Overspend reduces ticket XP.`}
    >
      <span className={over ? "text-amber-300" : "text-emerald-300"}>
        <AppIcon id="credit" size={13} />
      </span>
      <span className="font-mono text-[11px] font-semibold text-gray-100">{burn.toFixed(2)}</span>
      <span className="text-[9px] uppercase tracking-wider text-gray-600">cr/h</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-gray-500/25">
        <span
          className={`block h-full rounded-full ${over ? "bg-amber-400" : "bg-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

const TUNNEL_STYLE: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-300",
  down: "bg-gray-500/15 text-gray-400",
  negotiating: "bg-amber-500/15 text-amber-300",
  error: "bg-danger/15 text-danger",
};

function TunnelPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TUNNEL_STYLE[status]}`}
    >
      <AppIcon id="tunnel" size={11} />
      VPN {status}
    </span>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({ burn, operator }: { burn: number; operator: string }) {
  const cloud = useInfraStore((s) => s.infra.cloud);
  const licenses = useHostStore((s) => s.host.licenses);
  const openApp = useHostStore((s) => s.openApp);
  const finops = hasLicense(licenses, "finops-analytics");
  const running = cloud.vnodes.filter((v) => v.status === "running");
  const storageGb = cloud.buckets.reduce((t, b) => t + b.sizeGb, 0);
  const exposed = exposedAdminRules(cloud);
  const publicBuckets = cloud.buckets.filter((b) => b.publicAccess);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Virtual networks" value={String(cloud.avns.length)} sub={cloud.avns[0]?.region ?? "—"} />
        <Stat label="vNodes running" value={`${running.length}`} sub={`of ${cloud.vnodes.length} provisioned`} />
        <Stat label="Object storage" value={`${storageGb.toLocaleString()} GB`} sub={`${cloud.buckets.length} buckets`} />
        <Stat
          label="Hourly burn"
          value={`${burn.toFixed(2)} cr`}
          sub={burn > BUDGET_ALLOWANCE ? `over the ${BUDGET_ALLOWANCE} cr allowance` : "within allowance"}
          tone={burn > BUDGET_ALLOWANCE ? "warn" : "ok"}
        />
      </div>

      {(exposed.length > 0 || publicBuckets.length > 0) && (
        <Panel title="Posture findings" tone="warn">
          {exposed.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1 text-[11px]">
              <AppIcon id="alert" size={12} />
              <span className="font-mono text-gray-200">{r.id}</span>
              <span className="text-amber-200/80">
                {r.protocol.toUpperCase()} {r.port} reachable from the public internet
              </span>
            </div>
          ))}
          {publicBuckets.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-1 text-[11px]">
              <AppIcon id="alert" size={12} />
              <span className="font-mono text-gray-200">{b.name}</span>
              <span className="text-amber-200/80">DataBucket allows public read</span>
            </div>
          ))}
        </Panel>
      )}

      {!finops ? (
        <Panel title="Cost breakdown">
          <div className="flex items-center gap-2.5">
            <span className="text-gray-600">
              <AppIcon id="lock" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-300">Per-resource attribution is locked</div>
              <div className="text-[10px] text-gray-600">
                FinOps Analytics licence required — the header still shows your total burn.
              </div>
            </div>
            <button
              onClick={() => openApp("procurement")}
              className="shrink-0 rounded-md border border-info/40 px-2.5 py-1 text-[10px] font-semibold text-info hover:bg-info/10"
            >
              View licence
            </button>
          </div>
        </Panel>
      ) : (
      <Panel title="Cost breakdown">
        <table className="w-full text-left text-[11.5px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-gray-600">
              <th className="pb-1 font-semibold">Resource</th>
              <th className="pb-1 font-semibold">Class</th>
              <th className="pb-1 text-right font-semibold">cr/hour</th>
            </tr>
          </thead>
          <tbody>
            {running.map((v) => (
              <tr key={v.id} className="border-t border-edge/40">
                <td className="py-1 font-mono text-gray-200">{v.name}</td>
                <td className="py-1 text-gray-500">{sizeSpec(v.size).label}</td>
                <td className="py-1 text-right font-mono text-gray-300">
                  {sizeSpec(v.size).creditsPerHour.toFixed(2)}
                </td>
              </tr>
            ))}
            {cloud.buckets.map((b) => {
              const tier = BUCKET_TIERS.find((t) => t.id === b.tier)!;
              return (
                <tr key={b.id} className="border-t border-edge/40">
                  <td className="py-1 font-mono text-gray-200">{b.name}</td>
                  <td className="py-1 text-gray-500">
                    {tier.label} · {b.sizeGb} GB
                  </td>
                  <td className="py-1 text-right font-mono text-gray-300">
                    {(b.sizeGb * tier.creditsPerGbHour).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 border-t border-edge pt-2 text-[10px] text-gray-500">
          Stopped vNodes bill nothing. Sustained spend above {BUDGET_ALLOWANCE} cr/hour is treated as
          budget inefficiency and reduces the XP awarded on ticket resolution.
        </div>
      </Panel>
      )}

      <div className="text-[10px] text-gray-600">Signed in as {operator}</div>
    </div>
  );
}

// ── Compute ─────────────────────────────────────────────────────────────────

function Compute({ operator }: { operator: string }) {
  const cloud = useInfraStore((s) => s.infra.cloud);
  const launch = useInfraStore((s) => s.cloudLaunchVNode);
  const setStatus = useInfraStore((s) => s.cloudSetVNodeStatus);
  const terminate = useInfraStore((s) => s.cloudTerminateVNode);
  const setBucketPublic = useInfraStore((s) => s.cloudSetBucketPublic);

  const [name, setName] = useState("vnode-web-02");
  const [size, setSize] = useState<VNodeSize>("standard");
  const [purpose, setPurpose] = useState<"web" | "database" | "backup" | "general">("web");

  return (
    <div className="space-y-4">
      <Panel title="Launch an Aether Compute Node">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-44 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </Field>
          <Field label="Size">
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as VNodeSize)}
              className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              {VNODE_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.vcpu} vCPU / {s.memGb} GB · {s.creditsPerHour} cr/h
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purpose">
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as typeof purpose)}
              className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              <option value="web">Web</option>
              <option value="database">Database</option>
              <option value="backup">Backup</option>
              <option value="general">General</option>
            </select>
          </Field>
          <button
            onClick={() => {
              if (!name.trim() || !cloud.avns[0]) return;
              launch({ name: name.trim(), avnId: cloud.avns[0].id, size, purpose, actor: operator });
            }}
            className="rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-[11px] font-semibold text-info hover:bg-info/20"
          >
            Launch vNode
          </button>
        </div>
        {size === "high-spec" && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-300">
            <AppIcon id="alert" size={11} />
            High-Spec bills {sizeSpec("high-spec").creditsPerHour} cr/h — well over the allowance on its own.
          </div>
        )}
      </Panel>

      <Panel title={`vNodes (${cloud.vnodes.length})`}>
        {cloud.vnodes.map((v) => (
          <div key={v.id} className="flex items-center gap-2.5 border-t border-edge/40 py-2 first:border-0">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                v.status === "running" ? "bg-emerald-400" : "bg-gray-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-gray-100">{v.name}</span>
                <span className="rounded bg-gray-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gray-400">
                  {sizeSpec(v.size).label}
                </span>
                <span className="text-[10px] text-gray-600">{v.purpose}</span>
              </div>
              <div className="font-mono text-[10px] text-gray-500">
                {v.id} · {v.privateIp} · {sizeSpec(v.size).creditsPerHour} cr/h
              </div>
            </div>
            <button
              onClick={() => setStatus(v.id, v.status === "running" ? "stopped" : "running", operator)}
              className="rounded border border-edge px-2 py-1 text-[10px] text-gray-300 hover:bg-edge"
            >
              {v.status === "running" ? "Stop" : "Start"}
            </button>
            <button
              onClick={() => terminate(v.id, operator)}
              className="rounded border border-danger/40 px-2 py-1 text-[10px] text-danger hover:bg-danger/10"
            >
              Terminate
            </button>
          </div>
        ))}
      </Panel>

      <Panel title={`Aether DataBuckets (${cloud.buckets.length})`}>
        {cloud.buckets.map((b) => (
          <div key={b.id} className="flex items-center gap-2.5 border-t border-edge/40 py-2 first:border-0">
            <AppIcon id="disk" size={14} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[12px] text-gray-100">{b.name}</div>
              <div className="text-[10px] text-gray-500">
                {BUCKET_TIERS.find((t) => t.id === b.tier)?.label} tier · {b.sizeGb.toLocaleString()} GB
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-400">
              <input
                type="checkbox"
                checked={b.publicAccess}
                onChange={(e) => setBucketPublic(b.id, e.target.checked, operator)}
                className="accent-danger"
              />
              Public read
            </label>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ── Network (AVNs + IPsec tunnel + route test) ──────────────────────────────

function Network({ operator }: { operator: string }) {
  const infra = useInfraStore((s) => s.infra);
  const configure = useInfraStore((s) => s.cloudConfigureVpn);
  const disconnect = useInfraStore((s) => s.cloudDisconnectVpn);
  const addRule = useInfraStore((s) => s.cloudAddShieldRule);
  const deleteRule = useInfraStore((s) => s.cloudDeleteShieldRule);
  const arm = useArmed();
  const restrictRule = useInfraStore((s) => s.cloudRestrictShieldRule);

  const cloud = infra.cloud;
  const vpn = cloud.vpn;

  // Candidate on-prem terminators: the routers/firewalls/DCs that could plausibly
  // hold a tunnel, from the gateway estate.
  const gateways = infra.gateway
    .map((g) => infra.nodes[g.nodeId])
    .filter((n) => !!n);

  const [gwId, setGwId] = useState<string>(vpn.localGatewayNodeId ?? gateways[0]?.nodeId ?? "");
  const [localCidr, setLocalCidr] = useState(vpn.localCidr || infra.subnets[0]?.cidr || "");
  const [avnId, setAvnId] = useState(vpn.remoteAvnId ?? cloud.avns[0]?.id ?? "");
  const [psk, setPsk] = useState(vpn.psk || "");

  // Route test
  const [src, setSrc] = useState(
    infra.subnets[0]?.cidr.split("/")[0].replace(/0$/, "10") ?? "10.0.1.10",
  );
  const [dst, setDst] = useState(cloud.vnodes[0]?.privateIp ?? "");
  const route = useMemo(() => (dst ? hybridRoute(cloud, src, dst) : null), [cloud, src, dst]);

  return (
    <div className="space-y-4">
      <Panel title="Aether Virtual Networks">
        {cloud.avns.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-t border-edge/40 py-2 first:border-0">
            <AppIcon id="cloud" size={15} />
            <span className="font-mono text-[12px] text-gray-100">{a.name}</span>
            <span className="font-mono text-[11px] text-info">{a.cidr}</span>
            <span className="ml-auto text-[10px] text-gray-500">{a.region}</span>
          </div>
        ))}
      </Panel>

      <Panel title="IPsec site-to-site tunnel">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Local gateway">
            <select
              value={gwId}
              onChange={(e) => setGwId(e.target.value)}
              className="w-48 rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              {gateways.map((n) => (
                <option key={n.nodeId} value={n.nodeId}>
                  {n.hostname} ({n.role})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Local network (CIDR)">
            <input
              value={localCidr}
              onChange={(e) => setLocalCidr(e.target.value)}
              placeholder="10.60.1.0/24"
              className="w-36 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </Field>
          <Field label="Remote AVN">
            <select
              value={avnId}
              onChange={(e) => setAvnId(e.target.value)}
              className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              {cloud.avns.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.cidr})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pre-shared key">
            <input
              value={psk}
              onChange={(e) => setPsk(e.target.value)}
              placeholder="min 8 characters"
              className="w-40 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </Field>
          <button
            onClick={() => {
              configure({ localGatewayNodeId: gwId, localCidr, remoteAvnId: avnId, psk, actor: operator });
              if (psk.trim().length < 8) playCue("error");
            }}
            className="rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-[11px] font-semibold text-info hover:bg-info/20"
          >
            {vpn.status === "connected" ? "Reconfigure tunnel" : "Establish tunnel"}
          </button>
          {vpn.status === "connected" && (
            <button
              onClick={() => disconnect(operator)}
              className="rounded-md border border-danger/40 px-3 py-1.5 text-[11px] text-danger hover:bg-danger/10"
            >
              Tear down
            </button>
          )}
        </div>

        {vpn.status === "connected" && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2.5 text-[11px] text-emerald-200/90">
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcon id="check" size={12} /> Tunnel up
            </div>
            <div className="mt-1 font-mono text-[10px] text-emerald-200/70">
              {infra.nodes[vpn.localGatewayNodeId ?? ""]?.hostname} · {vpn.localCidr} ↔{" "}
              {cloud.avns.find((a) => a.id === vpn.remoteAvnId)?.cidr}
            </div>
          </div>
        )}
        {vpn.status === "error" && vpn.lastError && (
          <div className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/[0.07] p-2.5 text-[11px] text-danger">
            <AppIcon id="alert" size={12} /> {vpn.lastError}
          </div>
        )}
      </Panel>

      <Panel title="Hybrid route test">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Source IP">
            <input
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              className="w-32 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </Field>
          <Field label="Destination">
            <select
              value={dst}
              onChange={(e) => setDst(e.target.value)}
              className="rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-200 outline-none"
            >
              {cloud.vnodes.map((v) => (
                <option key={v.id} value={v.privateIp}>
                  {v.name} — {v.privateIp}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {route && (
          <div
            className={`mt-2.5 rounded-lg border p-2.5 text-[11px] ${
              route.ok
                ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200/90"
                : "border-danger/40 bg-danger/[0.07] text-danger"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcon id={route.ok ? "check" : "ban"} size={12} />
              {route.ok ? "Reachable" : "No route"}
            </div>
            <div className="mt-1">{route.reason}</div>
            <div className="mt-1 font-mono text-[10px] opacity-70">{route.path.join("  →  ")}</div>
          </div>
        )}
      </Panel>

      <Panel title={`Aether Shield rules (${cloud.shieldRules.length})`}>
        {cloud.shieldRules.map((r) => {
          const risky = r.action === "allow" && r.source === "0.0.0.0/0" && [22, 3389, 5432, 3306, 1433, 27017].includes(r.port);
          return (
            <div
              key={r.id}
              className={`flex items-center gap-2.5 border-t border-edge/40 py-2 first:border-0 ${
                risky ? "-mx-2 rounded bg-danger/[0.07] px-2" : ""
              }`}
            >
              <span className={risky ? "text-danger" : "text-gray-600"}>
                <AppIcon id={risky ? "alert" : "shield"} size={13} />
              </span>
              <span className="font-mono text-[11px] text-gray-300">{r.id}</span>
              <span className="font-mono text-[11px] text-gray-100">
                {r.protocol.toUpperCase()} {r.port}
              </span>
              <span className="font-mono text-[11px] text-gray-500">from {r.source}</span>
              <span className="truncate text-[10px] text-gray-600">{r.description}</span>
              <div className="ml-auto flex shrink-0 gap-1.5">
                {risky && (
                  <button
                    onClick={() => restrictRule(r.id, "10.0.0.0/8", operator)}
                    className="rounded border border-edge px-2 py-0.5 text-[10px] text-gray-300 hover:bg-edge"
                  >
                    Restrict to 10.0.0.0/8
                  </button>
                )}
                {/* Two presses. A shield rule is part of the estate's
                    perimeter and there is no undo behind this. */}
                <button
                  onClick={() => arm.press(r.id) && deleteRule(r.id, operator)}
                  title={arm.isArmed(r.id) ? "Press again to delete this rule" : "Delete this rule"}
                  className={`rounded border px-2 py-0.5 text-[10px] transition ${
                    arm.isArmed(r.id)
                      ? "border-danger bg-danger/20 text-danger-strong font-semibold"
                      : "border-danger/40 text-danger hover:bg-danger/10"
                  }`}
                >
                  {arm.isArmed(r.id) ? "Confirm delete" : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
        <button
          onClick={() =>
            addRule(
              {
                avnId: cloud.avns[0]?.id ?? "avn-01",
                description: "Manual rule",
                protocol: "tcp",
                port: 8080,
                source: "10.0.0.0/8",
                action: "allow",
              },
              operator,
            )
          }
          className="mt-2 rounded border border-edge px-2 py-1 text-[10px] text-gray-400 hover:bg-edge"
        >
          Add rule (TCP 8080 from 10.0.0.0/8)
        </button>
      </Panel>
    </div>
  );
}

// ── Traffic routers ─────────────────────────────────────────────────────────

function Traffic({ operator }: { operator: string }) {
  const infra = useInfraStore((s) => s.infra);
  const create = useInfraStore((s) => s.cloudCreateRouter);
  const setEnabled = useInfraStore((s) => s.cloudSetRouterEnabled);
  const remove = useInfraStore((s) => s.cloudDeleteRouter);
  const arm = useArmed();

  const cloud = infra.cloud;
  const webNodes = infra.gateway
    .map((g) => infra.nodes[g.nodeId])
    .filter((n) => n && (n.role === "web-server" || n.role === "load-balancer"));

  const [name, setName] = useState("atr-web");
  const [origin, setOrigin] = useState(webNodes[0]?.nodeId ?? "");
  const [threshold, setThreshold] = useState(80);
  const [targets, setTargets] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <Panel title="Create an Aether Traffic Router">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-36 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </Field>
          <Field label="On-prem origin">
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-48 rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              <option value="">None (cloud only)</option>
              {webNodes.map((n) => (
                <option key={n.nodeId} value={n.nodeId}>
                  {n.hostname} ({n.role})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fail over above">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={40}
                max={99}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-16 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
              />
              <span className="text-[10px] text-gray-500">% CPU</span>
            </div>
          </Field>
        </div>

        <div className="mt-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-600">Targets</div>
          <div className="flex flex-wrap gap-1.5">
            {cloud.vnodes.map((v) => {
              const on = targets.includes(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => setTargets(on ? targets.filter((t) => t !== v.id) : [...targets, v.id])}
                  className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                    on ? "bg-info/20 text-info ring-1 ring-info/40" : "bg-gray-500/10 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {v.name}
                  <span className="ml-1 opacity-60">{v.status === "running" ? "running" : "stopped"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => {
            if (!name.trim() || targets.length === 0) {
              playCue("error");
              return;
            }
            create({
              name: name.trim(),
              avnId: cloud.avns[0]?.id ?? "avn-01",
              targets,
              originNodeId: origin || null,
              cpuThreshold: threshold,
              actor: operator,
            });
            setTargets([]);
          }}
          className="mt-3 rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-[11px] font-semibold text-info hover:bg-info/20"
        >
          Create router
        </button>
        {targets.length === 0 && (
          <span className="ml-2 text-[10px] text-gray-600">Select at least one target vNode.</span>
        )}
      </Panel>

      <Panel title={`Routers (${cloud.routers.length})`}>
        {cloud.routers.length === 0 && (
          <div className="py-3 text-center text-[11px] text-gray-600">No traffic routers configured.</div>
        )}
        {cloud.routers.map((r) => (
          <div key={r.id} className="flex items-center gap-2.5 border-t border-edge/40 py-2 first:border-0">
            <span className={`h-2 w-2 rounded-full ${r.enabled ? "bg-emerald-400" : "bg-gray-500"}`} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[12px] text-gray-100">{r.name}</div>
              <div className="text-[10px] text-gray-500">
                {r.targets.length} target(s)
                {r.originNodeId
                  ? ` · origin ${infra.nodes[r.originNodeId]?.hostname} above ${r.cpuThreshold}% CPU`
                  : " · cloud only"}
              </div>
            </div>
            <button
              onClick={() => setEnabled(r.id, !r.enabled, operator)}
              className="rounded border border-edge px-2 py-1 text-[10px] text-gray-300 hover:bg-edge"
            >
              {r.enabled ? "Disable" : "Enable"}
            </button>
            <button
              onClick={() => arm.press(r.id) && remove(r.id, operator)}
              title={arm.isArmed(r.id) ? "Press again to delete" : "Delete"}
              className={`rounded border px-2 py-1 text-[10px] transition ${
                arm.isArmed(r.id)
                  ? "border-danger bg-danger/20 text-danger-strong font-semibold"
                  : "border-danger/40 text-danger hover:bg-danger/10"
              }`}
            >
              {arm.isArmed(r.id) ? "Confirm delete" : "Delete"}
            </button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ── AetherTrace ─────────────────────────────────────────────────────────────

const SEV_STYLE: Record<AuditSeverity, string> = {
  info: "text-gray-500",
  warning: "text-amber-300",
  critical: "text-danger",
};

function Trace() {
  const audit = useInfraStore((s) => s.infra.cloud.audit);
  const [severity, setSeverity] = useState<AuditSeverity | "all">("all");
  const [query, setQuery] = useState("");

  const rows = audit.filter((e) => {
    if (severity !== "all" && e.severity !== severity) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${e.actor} ${e.action} ${e.target}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "all" as const, label: "All" },
            { value: "info" as const, label: "Info" },
            { value: "warning" as const, label: "Warning" },
            { value: "critical" as const, label: "Critical" },
          ]}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by actor, action or resource…"
          className="w-64 rounded border border-edge bg-panel px-2 py-1.5 text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
        />
        <span className="text-[10px] text-gray-600">{rows.length} events</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-edge">
        <div className="grid grid-cols-[92px_110px_1fr_92px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-600">
          <span>Time</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Resource</span>
        </div>
        {rows.length === 0 && (
          <EmptyState compact icon={<IconList size={15} />} title="No matching events" body="Nothing in the audit log fits the current filter." />
        )}
        {rows.map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-[92px_110px_1fr_92px] gap-2 border-b border-edge/40 px-3 py-1.5 text-[11px] last:border-0 hover:bg-gray-500/[0.07]"
          >
            <span className="font-mono text-[10px] text-gray-600">
              {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="truncate font-mono text-[10px] text-gray-400">{e.actor}</span>
            <span className={`min-w-0 ${SEV_STYLE[e.severity]}`}>
              <span className="flex items-start gap-1.5">
                {e.severity !== "info" && <AppIcon id="alert" size={11} />}
                <span className="min-w-0">{e.action}</span>
              </span>
            </span>
            <span className="truncate font-mono text-[10px] text-gray-500">{e.target}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function Panel({
  title,
  tone = "plain",
  children,
}: {
  title: string;
  tone?: "plain" | "warn";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border p-3.5 ${
        tone === "warn" ? "border-amber-500/30 bg-amber-500/[0.05]" : "border-edge bg-panelalt/50"
      }`}
    >
      <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] uppercase tracking-wider text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-edge bg-panelalt/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div
        className={`mt-0.5 font-mono text-lg font-semibold leading-none ${
          tone === "warn" ? "text-amber-300" : "text-gray-100"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-gray-600">{sub}</div>
    </div>
  );
}
