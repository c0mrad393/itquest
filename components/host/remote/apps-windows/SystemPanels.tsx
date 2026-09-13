"use client";

/**
 * ServerOS shell windows — This PC, Recycle Bin, DNS Manager
 * ==========================================================
 * The three desktop objects that are part of the SHELL rather than part of the
 * administrative toolset. They live together because they share a constraint:
 * each one is a window a real server desktop has, and none of them may invent
 * state to fill itself.
 *
 * ── WHY THESE ARE READ-ONLY ─────────────────────────────────────────────────
 *
 * Everything that mutates the estate goes through the Admin Center, Services or
 * Network Connections, where the change is visible and gradeable. These three
 * report. A This PC that let you repartition a disk would be a second place to
 * change the machine, and the two would drift.
 *
 * The one exception is emptying the Recycle Bin, which is genuinely a shell
 * action and genuinely destroys nothing here — see the note on that component.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useMemo } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { SERVER_OS_FULL } from "@/lib/core";
import { resolveDriveStatus } from "@/lib/infra/shares";
import { AppIcon } from "@/components/ui/app-icons";

// ── Shared layout ───────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto term-scroll bg-surface p-4 text-gray-200">{children}</div>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 border-b border-edge pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-[3px] text-[11px]">
      <span className="w-40 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-gray-100">{value}</span>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <p className="py-2 text-[11px] text-gray-500">{what}</p>;
}

/** Percentage bar for drive usage. Colour tracks pressure, not decoration. */
function UsageBar({ pct }: { pct: number }) {
  const tone = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warn" : "bg-info";
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-500/20">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ── This PC ─────────────────────────────────────────────────────────────────

/**
 * System properties and storage.
 *
 * Everything here is read off the node — edition, build, domain, the health
 * sampler's disk figure, and any drives actually mapped. Nothing is invented,
 * which is why there is no "12 GB free of 500 GB": the model tracks a used
 * PERCENTAGE, so that is what this shows.
 */
export function ThisPcPanel({ nodeId }: { nodeId: string }) {
  // Narrowed on the discriminant, not asserted: the node map is a union.
  const raw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const infra = useInfraStore((s) => s.infra);
  const reconnect = useInfraStore((s) => s.reconnectMappedDrive);
  const node = raw?.os === "windows" ? raw : undefined;
  if (!node) return <Missing what="This host is no longer in the estate." />;

  const mapped = node.mappedDrives ?? [];
  const up = node.health.uptimeSeconds;
  const uptime =
    up >= 86_400
      ? `${Math.floor(up / 86_400)}d ${Math.floor((up % 86_400) / 3600)}h`
      : up >= 3600
        ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`
        : `${Math.floor(up / 60)}m`;

  return (
    <Shell>
      <Group title="Devices and drives">
        <div className="rounded-md border border-edge bg-panelalt p-3">
          <div className="flex items-center gap-2">
            <AppIcon id="disk" size={15} />
            <span className="text-[12px] font-medium text-gray-100">Local Disk (C:)</span>
            <span className="ml-auto font-mono text-[11px] text-gray-400">{node.health.diskUsedPct}% used</span>
          </div>
          <UsageBar pct={node.health.diskUsedPct} />
        </div>

        {/*
          THE SAME FACT THIS FILE MANAGER ALREADY KNOWS.
          
          These tiles listed every mapped drive identically, so a drive that
          was down looked exactly like one that was working — while the
          endpoint's own file view two clicks away struck it through with a
          red cross. Two views of one fact, one of them silent, which is the
          worst version: the operator checks here, sees nothing wrong, and
          concludes the user is imagining it.
        */}
        {mapped.length > 0 && (
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
            {mapped.map((d) => {
              const status = resolveDriveStatus(infra, d);
              const ok = status === "connected";
              return (
                <div
                  key={d.letter}
                  className={`rounded-md border p-3 ${ok ? "border-edge bg-panelalt" : "border-danger/40 bg-danger/[0.06]"}`}
                >
                  <div className="flex items-center gap-2">
                    <AppIcon id="folder" size={14} />
                    <span className={`truncate text-[11px] font-medium ${ok ? "text-gray-100" : "text-gray-400 line-through"}`}>
                      {d.letter}
                    </span>
                    <span className={`ml-auto shrink-0 text-[10px] ${ok ? "text-accent-strong" : "text-danger-strong"}`}>
                      {status === "connected"
                        ? "Connected"
                        : status === "auth_error"
                          ? "Access denied"
                          : "Disconnected"}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-gray-400">{d.remotePath}</div>
                  {/*
                    Offered only when it could help. Reconnect clears the
                    CLIENT's session and lets the status resolve again — if the
                    share service is down it will come straight back, which is
                    the answer rather than a failure.
                  */}
                  {!ok && (
                    <button
                      onClick={() => reconnect(nodeId, d.letter)}
                      className="mt-2 w-full rounded border border-edge px-2 py-1 text-[10.5px] text-gray-200 transition hover:bg-panel"
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Group>

      <Group title="System">
        <Row label="Device name" value={<span className="font-mono">{node.hostname}</span>} />
        <Row label="Full name" value={node.displayName} />
        <Row label="Operating system" value={node.edition || SERVER_OS_FULL} />
        <Row label="Build" value={<span className="font-mono">{node.build}</span>} />
        <Row label="Role" value={node.isDomainController ? "Domain controller" : node.role} />
        <Row label="Domain" value={node.domain ?? "WORKGROUP"} />
      </Group>

      <Group title="Performance">
        <Row label="Processor load" value={`${node.health.cpuLoad}%`} />
        <Row label="Memory in use" value={`${node.health.memUsedPct}%`} />
        <Row label="Uptime" value={uptime} />
        <Row label="Health" value={node.health.status} />
      </Group>

      <Group title="Network">
        <Row label="IPv4 address" value={<span className="font-mono">{node.connection.ip}</span>} />
        <Row label="Remote protocol" value={`${node.connection.protocol.toUpperCase()} : ${node.connection.port}`} />
        <Row label="Round trip" value={`${node.connection.latencyMs} ms`} />
      </Group>
    </Shell>
  );
}

// ── Recycle Bin ─────────────────────────────────────────────────────────────

/**
 * Always empty, and honestly so.
 *
 * There is no deleted-items model in the estate, and inventing one to give this
 * window something to list would be a prop: files that never existed, which
 * cannot be restored, in a bin that grades nothing. An empty Recycle Bin is
 * both the truth and — on a freshly-provisioned server — the realistic state.
 */
export function RecycleBinPanel() {
  return (
    <Shell>
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500/15 text-gray-400">
          <AppIcon id="recycle" size={22} />
        </span>
        <div>
          <div className="text-[12px] font-medium text-gray-200">This folder is empty</div>
          <p className="mx-auto mt-1 max-w-[22rem] text-[11px] leading-relaxed text-gray-500">
            Nothing has been deleted on this server. Files removed through the Admin Center are
            released immediately rather than staged here.
          </p>
        </div>
      </div>
    </Shell>
  );
}

// ── DNS Manager ─────────────────────────────────────────────────────────────

/**
 * Forward-lookup records, derived from the estate rather than stored.
 *
 * A DC that runs the DNS role is what lets every other machine resolve names,
 * so the zone it serves is not separate data — it IS the estate's hosts, read
 * as records. Deriving it means a machine that gets a new address shows the new
 * record here with nothing to keep in sync, which is the stored-vs-derived rule
 * doing exactly what it is for.
 *
 * Read-only: the address of record lives on the node, and the place to change
 * it is Network Connections. Two editors for one field is how they disagree.
 */
export function DnsManagerPanel({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const raw = infra.nodes[nodeId];
  const node = raw?.os === "windows" ? raw : undefined;

  const zone = node?.domain ?? null;

  const records = useMemo(() => {
    if (!zone) return [];
    return Object.values(infra.nodes)
      .filter((n) => n.domain === zone && !!n.connection.ip)
      .map((n) => ({
        name: n.hostname,
        type: "A" as const,
        data: n.connection.ip,
        isSelf: n.nodeId === nodeId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [infra.nodes, zone, nodeId]);

  if (!node) return <Missing what="This host is no longer in the estate." />;

  const dnsService = node.services?.DNS;

  if (!dnsService) {
    return (
      <Shell>
        <Missing what="This server does not run the DNS role, so it serves no zones." />
      </Shell>
    );
  }

  return (
    <Shell>
      <Group title="Server status">
        <Row label="Service" value={dnsService.displayName} />
        <Row
          label="State"
          value={
            <span className={dnsService.status === "Running" ? "text-ok-text" : "text-danger-text"}>
              {dnsService.status}
            </span>
          }
        />
        <Row label="Startup type" value={dnsService.startupType} />
        <Row label="Resolvers configured" value={node.network.dnsServers.join(", ") || "none"} />
      </Group>

      {dnsService.status !== "Running" && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-[11px] leading-relaxed text-gray-200">
          The DNS service is stopped. This server is still authoritative for{" "}
          <span className="font-mono">{zone}</span>, but it is answering nothing — clients will fall
          back to their alternate resolver, or fail to resolve at all. Start the service from
          Services.
        </div>
      )}

      <Group title={zone ? `Forward lookup zone — ${zone}` : "Forward lookup zones"}>
        {!zone ? (
          <Missing what="This server is not joined to a domain, so it hosts no forward lookup zone." />
        ) : (
          <div className="overflow-hidden rounded-md border border-edge">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-panelalt text-gray-400">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {records.map((r) => (
                  <tr key={r.name} className="bg-panel">
                    <td className="px-3 py-1.5 font-mono text-gray-100">
                      {r.name}
                      {r.isSelf && <span className="ml-2 text-[10px] text-gray-500">(this server)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">{r.type}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-100">{r.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
          Records are read from the estate as it currently stands. To change an address, use Network
          Connections on the machine that owns it.
        </p>
      </Group>
    </Shell>
  );
}
