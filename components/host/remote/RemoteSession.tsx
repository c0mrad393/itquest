"use client";

/**
 * RemoteSession — reusable nested remote-session container (Level 1)
 * -----------------------------------------------------------------
 * The body of a RemoteSessionWindow. Runs a realistic protocol handshake
 * (SSH or RDP), then hands off to NodeEnvironment for the OS-specific surface.
 * A thin session bar shows protocol/latency and a Disconnect control.
 *
 * This container is OS-agnostic and reusable — every nested session (any node)
 * flows through it, satisfying the Phase-3 "reusable nested window" requirement.
 */

import { useEffect, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { reachNode } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import type { RemoteSessionWindow } from "@/lib/host/windows";
import NodeEnvironment from "./NodeEnvironment";
import { AppIcon } from "@/components/ui/app-icons";

type Phase = "connecting" | "authenticating" | "negotiating" | "connected" | "error";

/** Protocol-specific handshake transcript lines. */
function handshakeLines(protocol: string, ip: string, port: number, hostname: string): string[] {
  if (protocol === "ssh") {
    return [
      `Connecting to ${ip}:${port} ...`,
      `The authenticity of host '${ip}' can't be established.`,
      `ED25519 key fingerprint is SHA256:9zR2…kLmQ. Adding to known_hosts.`,
      `okhare@${ip}'s credentials accepted (publickey).`,
      `Negotiating cipher: chacha20-poly1305@openssh.com ...`,
      `Session established — allocating pty.`,
    ];
  }
  return [
    `Initiating RDP connection to ${ip}:${port} ...`,
    `Resolving ${hostname} ... ok`,
    `TLS 1.2 handshake — verifying certificate (CN=${hostname}) ...`,
    `NLA: submitting credentials (CORP\\okhare) ...`,
    `Negotiating desktop: 1280x720, 32bpp, RemoteFX ...`,
    `Session established — starting shell.`,
  ];
}

export default function RemoteSession({ win }: { win: RemoteSessionWindow }) {
  const node = useInfraStore((s) => s.infra.nodes[win.nodeId]);
  // Subscribed, not sampled: if the operator trips a PDU on the Datacenter
  // Floor while this session is open, the session has to notice.
  const infra = useInfraStore((s) => s.infra);
  const authenticate = useInfraStore((s) => s.authenticate);
  const close = useHostStore((s) => s.close);

  const reach = reachNode(infra, node);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [logIndex, setLogIndex] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const lines = node
    ? handshakeLines(win.protocol, node.connection.ip, node.connection.port, node.hostname)
    : [];

  useEffect(() => {
    if (!node) {
      setPhase("error");
      return;
    }
    if (!reach.reachable) {
      setPhase("error");
      return;
    }

    // Reveal transcript lines, then transition through phases to "connected".
    lines.forEach((_, i) => {
      timers.current.push(setTimeout(() => setLogIndex(i + 1), 260 * (i + 1)));
    });
    const total = 260 * (lines.length + 1);
    timers.current.push(setTimeout(() => setPhase("authenticating"), total * 0.4));
    timers.current.push(setTimeout(() => setPhase("negotiating"), total * 0.7));
    timers.current.push(
      setTimeout(() => {
        setPhase("connected");
        authenticate(win.nodeId, true);
      }, total),
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // Run once per mounted session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!node) {
    return <SessionError message={`Node '${win.nodeId}' not found in infrastructure.`} onClose={() => close(win.instanceId)} />;
  }
  // A LIVE SESSION DROPS. An SSH window that keeps working after its rack goes
  // dark is the exact fiction v0.5.0 exists to remove, so reachability is
  // re-checked on every render rather than only at connect time.
  if (phase === "error" || !reach.reachable) {
    return (
      <SessionError
        message={
          reach.reason
            ? `${reach.reason}${reach.remedy ? ` ${reach.remedy}` : ""}`
            : `Unable to reach ${node.hostname} (${node.connection.ip}). Host offline or filtered.`
        }
        onClose={() => close(win.instanceId)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Session bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/60 px-3 py-1 text-[11px] text-gray-300">
        <span className={`h-2 w-2 rounded-full ${phase === "connected" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
        <span className="uppercase tracking-wider">{win.protocol}</span>
        <span className="text-gray-500">·</span>
        <span className="font-mono">{node.connection.ip}:{node.connection.port}</span>
        <span className="text-gray-500">·</span>
        <span>{node.connection.latencyMs} ms</span>
        <span className="ml-auto capitalize text-gray-400">{phase}</span>
        <button
          onClick={() => close(win.instanceId)}
          className="ml-2 rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-danger hover:text-white"
        >
          Disconnect
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {phase === "connected" ? (
          <NodeEnvironment node={node} />
        ) : (
          <Handshake lines={lines.slice(0, logIndex)} />
        )}
      </div>
    </div>
  );
}

function Handshake({ lines }: { lines: string[] }) {
  return (
    <div className="h-full bg-term p-4 font-mono text-[12px] leading-relaxed text-gray-400">
      {lines.map((l, i) => (
        <div key={i} className={i === lines.length - 1 ? "text-gray-200" : ""}>
          <span className="text-gray-600">›</span> {l}
        </div>
      ))}
      <div className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-gray-400" />
    </div>
  );
}

function SessionError({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-black p-8 text-center">
      <div className="text-gray-500"><AppIcon id="plug" size={40} /></div>
      <div className="text-sm font-semibold text-danger">Connection failed</div>
      <p className="max-w-sm text-xs text-gray-400">{message}</p>
      <button
        onClick={onClose}
        className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-200 hover:bg-panelalt"
      >
        Close session
      </button>
    </div>
  );
}
