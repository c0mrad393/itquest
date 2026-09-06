/**
 * ITQuest — Bench → estate commissioning (pure)
 * =============================================
 * Turns a machine that was just built and imaged on the hardware bench into a
 * node the rest of the simulator understands.
 *
 * ── WHY THE SPECS COME FROM THE RIG ─────────────────────────────────────────
 *
 * The memory and storage figures here are read off what was physically fitted,
 * not typed into a form. That is the whole value of building the hardware model
 * first: an operator who leaves a stick out, or installs before replacing a
 * failed one, gets a node in the estate that genuinely has less memory — and
 * the ticket that follows is a real consequence rather than a scripted one.
 *
 * Pure, so the commissioning rules can be tested without a store.
 */

import type { WindowsNodeState } from "@/lib/core/windows";
import type { NetworkState } from "@/lib/vm/types";

export interface BenchBuild {
  machine: "desktop" | "laptop" | "server";
  cpuModel: string;
  ramGb: number;
  diskGb: number;
  nodeId: string;
  hostname: string;
  ip: string;
  gateway: string;
  domain?: string;
}

/**
 * A freshly imaged Windows machine.
 *
 * Deliberately NOT domain-joined: setup put an OS on it, and joining a domain
 * is a separate administrative act the operator performs afterwards. Handing
 * back a machine that had silently joined itself would skip the exact step the
 * next phase of the exercise is about.
 */
export function buildBenchNode(b: BenchBuild): WindowsNodeState {
  const network: NetworkState = {
    interfaces: [
      {
        name: "Ethernet0",
        up: true,
        ipv4: b.ip,
        netmask: "255.255.255.0",
        mac: `02:be:${b.ip.split(".").slice(1).map((o) => (+o).toString(16).padStart(2, "0")).join(":")}`,
        carrier: true,
      },
    ],
    routes: [{ destination: "default", gateway: b.gateway, iface: "Ethernet0", metric: 100 }],
    dnsServers: [b.gateway],
    hostsTable: { [b.hostname]: b.ip },
    firewall: [],
    reachableHosts: {},
  };

  return {
    nodeId: b.nodeId,
    hostname: b.hostname,
    displayName:
      b.machine === "server" ? "Bench-built server" : `Bench-built ${b.machine}`,
    role: b.machine === "server" ? "app-server" : "workstation",
    // No `domain` — see the note above. The machine is in a workgroup until
    // somebody joins it.
    connection: {
      protocol: "rdp",
      ip: b.ip,
      port: 3389,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 1.2,
    },
    network,
    health: {
      status: "healthy",
      cpuLoad: 3,
      memUsedPct: 18,
      diskUsedPct: 12,
      // Freshly imaged: it has been up for minutes, not months.
      uptimeSeconds: 240,
    },
    tags: ["bench-built", b.machine],
    // What was actually fitted. Leave a stick out and the estate knows.
    benchSpec: { cpuModel: b.cpuModel, ramGb: b.ramGb, diskGb: b.diskGb },
    workloads: [],
    os: "windows",
    edition: b.machine === "server" ? "Macrohard ServerOS 2024 Standard" : "Macrohard DeskOS 12 Pro",
    build: "22631.4317",
    isDomainController: false,
    filesystem: { type: "dir", children: {}, owner: "SYSTEM", group: "SYSTEM", mode: "drwxr-xr-x", mtime: 0 },
    services: {},
    processes: [],
    registry: [],
    firewall: {
      profiles: { Domain: { enabled: true }, Private: { enabled: true }, Public: { enabled: true } },
      rules: [],
    },
    eventLogs: { System: [], Application: [], Security: [], Setup: [] },
    localUsers: [],
    sessions: [],
    nextPid: 1200,
  };
}
