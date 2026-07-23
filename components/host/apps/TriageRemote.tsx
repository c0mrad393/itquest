"use client";

/**
 * TriageRemote — remote endpoint access gateway (Level-0 host app)
 * ---------------------------------------------------------------
 * Enter an IP or hostname, pick a protocol, connect. The target is validated
 * against the live InfrastructureState; on success the matching endpoint
 * environment is mounted inside this window:
 *
 *   Windows client → WindowsEndpointEnv (RDP)
 *   macOS client   → MacOSEndpointEnv   (RDP / screen sharing)
 *   Linux node     → LinuxSSHEnv        (SSH, pure CLI)
 *
 * Protocol is validated too: SSH only reaches Linux, RDP only reaches
 * Windows/macOS — mismatches produce a realistic refusal.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { TargetNode } from "@/lib/core";
import WindowsEndpointEnv from "../remote/endpoints/WindowsEndpointEnv";
import MacOSEndpointEnv from "../remote/endpoints/MacOSEndpointEnv";
import LinuxSSHEnv from "../remote/endpoints/LinuxSSHEnv";

type Protocol = "rdp" | "ssh";

const OS_META: Record<TargetNode["os"], { icon: string; label: string; protocol: Protocol }> = {
  windows: { icon: "🪟", label: "Windows", protocol: "rdp" },
  macos: { icon: "🍎", label: "macOS", protocol: "rdp" },
  linux: { icon: "🐧", label: "Linux", protocol: "ssh" },
};

export default function TriageRemote() {
  const infra = useInfraStore((s) => s.infra);
  const [target, setTarget] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("rdp");
  const [error, setError] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);

  const connected = connectedId ? infra.nodes[connectedId] : null;

  /** Resolve an IP or hostname (case-insensitive) against the world. */
  function resolve(q: string): TargetNode | undefined {
    const needle = q.trim().toLowerCase();
    return Object.values(infra.nodes).find(
      (n) =>
        n.hostname.toLowerCase() === needle ||
        n.nodeId.toLowerCase() === needle ||
        n.connection.ip === needle ||
        `${n.hostname}.${infra.org.domain}`.toLowerCase() === needle,
    );
  }

  function connect(q?: string, proto?: Protocol) {
    const query = q ?? target;
    const p = proto ?? protocol;
    setError(null);

    if (!query.trim()) return setError("Enter an IP address or hostname.");
    const node = resolve(query);
    if (!node) return setError(`No route to host '${query.trim()}' — not found in this environment.`);
    if (!node.connection.online || !node.connection.reachable) {
      return setError(`${node.hostname} is unreachable (host offline or filtered).`);
    }

    const expected = OS_META[node.os].protocol;
    if (p !== expected) {
      return setError(
        p === "ssh"
          ? `Connection refused: ${node.hostname} is a ${OS_META[node.os].label} host — SSH is not listening. Use RDP.`
          : `Connection refused: ${node.hostname} is a Linux host — no RDP service. Use SSH.`,
      );
    }

    useInfraStore.getState().authenticate(node.nodeId, true);
    setConnectedId(node.nodeId);
  }

  // ── Connected: mount the endpoint environment ──
  if (connected) {
    const meta = OS_META[connected.os];
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/60 px-3 py-1 text-[11px] text-gray-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="uppercase tracking-wider">{meta.protocol}</span>
          <span className="text-gray-500">·</span>
          <span className="font-mono">
            {connected.connection.ip}:{connected.connection.port}
          </span>
          <span className="text-gray-500">·</span>
          <span>
            {meta.icon} {connected.hostname}
          </span>
          <span className="ml-auto text-gray-400">Connected</span>
          <button
            onClick={() => {
              useInfraStore.getState().authenticate(connected.nodeId, false);
              setConnectedId(null);
            }}
            className="ml-2 rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-danger hover:text-white"
          >
            Disconnect
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {connected.os === "windows" ? (
            <WindowsEndpointEnv nodeId={connected.nodeId} />
          ) : connected.os === "macos" ? (
            <MacOSEndpointEnv nodeId={connected.nodeId} />
          ) : (
            <LinuxSSHEnv nodeId={connected.nodeId} />
          )}
        </div>
      </div>
    );
  }

  // ── Disconnected: the connection form ──
  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <div className="mx-auto w-full max-w-md p-6">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-info/20 text-xl text-info">
            🛰️
          </div>
          <div className="text-base font-bold text-gray-100">Remote Endpoint Access</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Connect to a managed endpoint in {infra.org.name}
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            IP address or hostname
          </span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect()}
            placeholder="10.20.4.11  ·  WS-288  ·  web-dmz-06"
            className="w-full rounded-lg border border-edge bg-panelalt px-3 py-2 font-mono text-sm outline-none placeholder:text-gray-600 focus:border-info"
          />
        </label>

        <div className="mb-4">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Protocol
          </span>
          <div className="flex gap-2">
            {(["rdp", "ssh"] as Protocol[]).map((p) => (
              <button
                key={p}
                onClick={() => setProtocol(p)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  protocol === p
                    ? "border-info bg-info/15 text-info"
                    : "border-edge text-gray-300 hover:bg-panelalt"
                }`}
              >
                {p.toUpperCase()}
                <span className="ml-1 font-normal text-gray-500">
                  {p === "rdp" ? "Windows / macOS" : "Linux"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            {error}
          </div>
        )}

        <button
          onClick={() => connect()}
          className="w-full rounded-lg bg-info px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110"
        >
          Connect
        </button>

        {/* Known endpoints — quick connect */}
        <div className="mt-5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Known endpoints
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto term-scroll">
            {Object.values(infra.nodes).map((n) => {
              const meta = OS_META[n.os];
              return (
                <button
                  key={n.nodeId}
                  onClick={() => {
                    setTarget(n.hostname);
                    setProtocol(meta.protocol);
                    connect(n.hostname, meta.protocol);
                  }}
                  className="flex w-full items-center gap-2 rounded border border-edge/60 bg-panelalt px-2 py-1.5 text-left text-xs hover:border-info/50"
                >
                  <span>{meta.icon}</span>
                  <span className="truncate text-gray-200">{n.hostname}</span>
                  <span className="truncate font-mono text-[10px] text-gray-500">{n.connection.ip}</span>
                  <span className="ml-auto rounded bg-black/30 px-1.5 py-0.5 text-[9px] uppercase text-gray-400">
                    {meta.protocol}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
