"use client";

/**
 * EndpointTools — shared troubleshooting apps for the mini endpoint OSes
 * ---------------------------------------------------------------------
 * OS-agnostic apps mounted inside both WindowsEndpointEnv and MacOSEndpointEnv:
 *   • EndpointTerminal — ping / ipconfig-ifconfig from the USER's perspective,
 *     reading the node's live network state (adapter up? DNS set?).
 *   • EndpointBrowser  — verifies intranet/internet reachability and visually
 *     replays 200 / 404 / 502 / "no connection" against the shared infra.
 *   • EndpointEventLog — endpoint-local error/warning log derived from node
 *     health, adapter state, and Windows event logs.
 *
 * These are read-mostly diagnostics; the mutating fixes live in Task Manager /
 * Network Settings which already write to InfrastructureState.
 */

import { useMemo, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { TargetNode } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";

// ── Terminal / Command Prompt ────────────────────────────────────────────────

interface Line {
  id: number;
  text: string;
  kind: "in" | "out" | "err";
}

export function EndpointTerminal({ nodeId, flavor }: { nodeId: string; flavor: "win" | "unix" }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]);
  const infra = useInfraStore((s) => s.infra);
  const [lines, setLines] = useState<Line[]>([
    { id: 0, kind: "out", text: flavor === "win" ? "Microsoft Windows [Version 10.0.22631.4317]" : "Last login: today on ttys000" },
  ]);
  const [input, setInput] = useState("");
  const seq = useRef(1);
  const ref = useRef<HTMLInputElement>(null);
  const scr = useRef<HTMLDivElement>(null);

  if (!node) return null;
  const prompt = flavor === "win" ? "C:\\Users\\user>" : `${node.hostname}:~ user$`;
  const nic = node.network.interfaces[0];

  function run(cmd: string) {
    const out: Line[] = [{ id: seq.current++, kind: "in", text: `${prompt} ${cmd}` }];
    const push = (t: string, kind: Line["kind"] = "out") => out.push({ id: seq.current++, kind, text: t });
    const parts = cmd.trim().split(/\s+/);
    const c = parts[0]?.toLowerCase();

    if (!c) {
      // blank
    } else if (c === "cls" || c === "clear") {
      setLines([]);
      setInput("");
      return;
    } else if (c === "ipconfig" || c === "ifconfig" || c === "ip") {
      if (!nic) push("No network adapters found.", "err");
      else if (!nic.up) {
        push(flavor === "win" ? "Media disconnected" : `${nic.name}: status: inactive`, "err");
      } else {
        if (flavor === "win") {
          push("");
          push(`Ethernet adapter ${nic.name}:`);
          push(`   IPv4 Address. . . . . . . . . . . : ${nic.ipv4}`);
          push(`   Subnet Mask . . . . . . . . . . . : ${nic.netmask}`);
          push(`   Default Gateway . . . . . . . . . : ${node.network.routes[0]?.gateway ?? "—"}`);
          push(`   DNS Servers . . . . . . . . . . . : ${node.network.dnsServers.join(", ") || "(none)"}`);
        } else {
          push(`${nic.name}: flags=8863<UP,BROADCAST,RUNNING> mtu 1500`);
          push(`        inet ${nic.ipv4} netmask ${nic.netmask}`);
          push(`        ether ${nic.mac}`);
        }
      }
    } else if (c === "ping") {
      const host = parts[1];
      if (!host) return push("Usage: ping <host>", "err");
      if (!nic?.up) {
        push(flavor === "win" ? "Transmit failed. General failure." : "ping: sendto: Network is down", "err");
      } else {
        const ip = infra.nodes[host]?.connection.ip ?? node.network.hostsTable[host] ??
          (/^\d/.test(host) ? host : infra.security.blockedIps.includes(host) ? host : "93.184.34.1");
        const blocked = infra.security.blockedIps.includes(ip) || infra.security.blockedIps.includes(host);
        push(`Pinging ${host} [${ip}] with 32 bytes of data:`);
        if (blocked) {
          for (let i = 0; i < 4; i++) push("Request timed out.", "err");
          push(`    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)`, "err");
        } else {
          for (let i = 0; i < 4; i++) push(`Reply from ${ip}: bytes=32 time=${(Math.random() * 8 + 1).toFixed(0)}ms TTL=64`);
          push(`    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`);
        }
      }
    } else if (c === "help") {
      push("Commands: ipconfig/ifconfig, ping <host>, nslookup <host>, cls, help");
    } else if (c === "nslookup") {
      const host = parts[1] ?? "";
      const ip = node.network.hostsTable[host] ?? infra.nodes[host]?.connection.ip;
      push(`Server:  ${node.network.dnsServers[0] ?? "(unset)"}`);
      if (node.network.dnsServers.length === 0) push("*** No DNS servers configured", "err");
      else if (ip) { push(""); push(`Name:    ${host}`); push(`Address: ${ip}`); }
      else push(`*** can't find ${host}: NXDOMAIN`, "err");
    } else {
      push(flavor === "win" ? `'${c}' is not recognized as an internal or external command.` : `${flavor === "unix" ? "-bash" : ""}: ${c}: command not found`, "err");
    }

    setLines((l) => [...l, ...out]);
    setInput("");
    requestAnimationFrame(() => scr.current?.scrollTo({ top: scr.current.scrollHeight }));
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0e14] font-mono text-[12px]" onClick={() => ref.current?.focus()}>
      <div ref={scr} className="flex-1 overflow-y-auto term-scroll p-2.5 leading-relaxed">
        {lines.map((l) => (
          <div key={l.id} className={l.kind === "err" ? "text-danger" : l.kind === "in" ? "text-gray-100" : "text-gray-300"}>
            {l.text || " "}
          </div>
        ))}
        <div className="flex">
          <span className="whitespace-nowrap text-accent">{prompt}&nbsp;</span>
          <input
            ref={ref}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(input)}
            className="flex-1 bg-transparent text-gray-100 outline-none"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="border-t border-edge/60 px-2.5 py-1 text-[10px] text-gray-600">
        Try: <span className="text-gray-400">{flavor === "win" ? "ipconfig" : "ifconfig"}</span> ·{" "}
        <span className="text-gray-400">ping {node.hostname}</span>
      </div>
    </div>
  );
}

// ── Web Browser ──────────────────────────────────────────────────────────────

export function EndpointBrowser({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]);
  const infra = useInfraStore((s) => s.infra);
  const [url, setUrl] = useState("http://intranet.corp/");
  const [nav, setNav] = useState("http://intranet.corp/");

  const result = useMemo(() => evaluate(nav, node, infra), [nav, node, infra]);
  if (!node) return null;

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Address bar */}
      <div className="flex items-center gap-1.5 border-b border-edge bg-panelalt px-2 py-1.5">
        <span className="text-gray-600">←</span>
        <span className="text-gray-600">→</span>
        <span className="cursor-pointer text-gray-400" onClick={() => setNav(url)}>⟳</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setNav(url)}
          className="flex-1 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-gray-200 outline-none focus:border-info"
        />
      </div>
      {/* Bookmarks */}
      <div className="flex gap-1.5 border-b border-edge/60 px-2 py-1 text-[10px] text-gray-500">
        {["http://intranet.corp/", "https://google.com", "http://web-01.corp/checkout"].map((b) => (
          <button key={b} onClick={() => { setUrl(b); setNav(b); }} className="rounded px-1.5 py-0.5 hover:bg-panelalt">
            {b.replace(/^https?:\/\//, "")}
          </button>
        ))}
      </div>
      {/* Page */}
      {/* A document pane is white whatever anyone's theme is, so it pins the
          light token set rather than hoping the ramp points the right way. */}
      <div className="theme-light flex-1 overflow-y-auto term-scroll bg-white/95 text-gray-800">
        <BrowserPage result={result} />
      </div>
    </div>
  );
}

type PageResult =
  | { status: "offline" }
  | { status: 200; title: string; body: string }
  | { status: 404 }
  | { status: 502; server: string };

function evaluate(url: string, node: TargetNode | undefined, infra: ReturnType<typeof useInfraStore.getState>["infra"]): PageResult {
  if (!node) return { status: "offline" };
  const nic = node.network.interfaces[0];
  if (!nic?.up) return { status: "offline" };

  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  const path = "/" + url.replace(/^https?:\/\//, "").split("/").slice(1).join("/");

  // Intranet portal — always up if the adapter is.
  if (host.startsWith("intranet")) {
    return { status: 200, title: `${infra.org.name} Intranet`, body: "Welcome to the corporate portal. HR, IT, and Payroll links are available." };
  }
  // Storefront / app endpoints proxy the DMZ web node → replay 502 when down.
  if (host.includes("web") || host.includes("checkout") || host.includes("corp")) {
    const web = Object.values(infra.nodes).find((n) => n.os === "linux" && "services" in n && (n as { services: Record<string, { status: string }> }).services.app);
    const appDown = web && (web as { services: Record<string, { status: string }> }).services.app?.status !== "active";
    if (appDown) return { status: 502, server: "nginx" };
    return { status: 200, title: "Storefront", body: `200 OK from ${host}${path} — checkout is operational.` };
  }
  // External internet — needs DNS + not blocked.
  if (node.network.dnsServers.length === 0) return { status: 404 };
  return { status: 200, title: host, body: `Loaded ${host} over the internet.` };
}

function BrowserPage({ result }: { result: PageResult }) {
  if (result.status === "offline") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-500">
        <div className="text-4xl"><AppIcon id="globe" size={34} /></div>
        <div className="text-sm font-semibold text-gray-700">No internet connection</div>
        <div className="text-xs">Your network adapter is disconnected. Re-enable it in Network Settings.</div>
      </div>
    );
  }
  if (result.status === 404) {
    return (
      <div className="p-8 text-center">
        <div className="text-3xl font-black text-gray-700">404</div>
        <div className="mt-1 text-sm text-gray-500">That page could not be found (check DNS).</div>
      </div>
    );
  }
  if (result.status === 502) {
    return (
      <div className="p-8 text-center font-mono">
        <div className="text-2xl font-bold text-gray-800">502 Bad Gateway</div>
        <div className="mt-2 text-sm text-gray-500">The proxy server received an invalid response from an upstream server.</div>
        <hr className="mx-auto my-3 w-40 border-gray-300" />
        <div className="text-xs text-gray-400">{result.server}</div>
      </div>
    );
  }
  return (
    <div className="p-6">
      <div className="mb-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">200 OK</div>
      <h1 className="text-lg font-bold text-gray-800">{result.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{result.body}</p>
    </div>
  );
}

// ── Event Viewer / Console Logs ──────────────────────────────────────────────

interface LogEntry {
  level: "Information" | "Warning" | "Error";
  source: string;
  message: string;
  ago: string;
}

export function EndpointEventLog({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]);
  if (!node) return null;

  const entries: LogEntry[] = [];
  const nic = node.network.interfaces[0];
  if (nic && !nic.up) entries.push({ level: "Error", source: "NetworkProfile", message: `Adapter '${nic.name}' is administratively disabled — no connectivity.`, ago: "just now" });
  if (node.network.dnsServers.length === 0) entries.push({ level: "Error", source: "Dnscache", message: "No DNS servers configured; name resolution will fail.", ago: "2m" });
  if (node.health.cpuLoad >= 85) entries.push({ level: "Warning", source: "Perflib", message: `Sustained high CPU (${node.health.cpuLoad}%) — a process may be misbehaving.`, ago: "1m" });
  if (node.health.diskUsedPct >= 90) entries.push({ level: "Warning", source: "Ntfs", message: `Volume C: is ${node.health.diskUsedPct}% full.`, ago: "5m" });
  const hotProc = node.processes.find((p) => p.cpu >= 40);
  if (hotProc) entries.push({ level: "Warning", source: "Application", message: `${hotProc.command} (PID ${hotProc.pid}) is consuming ${hotProc.cpu.toFixed(0)}% CPU.`, ago: "1m" });
  // Windows security events surface here too.
  if (node.os === "windows") {
    for (const e of node.eventLogs.Security.slice(0, 3)) {
      entries.push({ level: e.level === "Error" || e.level === "Critical" ? "Error" : "Warning", source: e.source, message: e.message, ago: "recent" });
    }
  }
  entries.push({ level: "Information", source: "Winlogon", message: `User '${node.os === "windows" ? (node.localUsers[0]?.name ?? "user") : "user"}' logged on interactively.`, ago: "3h" });
  entries.push({ level: "Information", source: "Time-Service", message: "System clock synchronized with domain controller.", ago: "4h" });

  const style = { Information: "text-sky-300", Warning: "text-amber-300", Error: "text-danger" };

  return (
    <div className="h-full overflow-y-auto term-scroll bg-panel text-xs">
      <div className="grid grid-cols-[70px_100px_1fr_50px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Level</span>
        <span>Source</span>
        <span>Message</span>
        <span className="text-right">When</span>
      </div>
      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-[70px_100px_1fr_50px] items-start gap-2 border-b border-edge/50 px-3 py-2">
          <span className={`font-semibold ${style[e.level]}`}>{e.level}</span>
          <span className="truncate text-gray-400">{e.source}</span>
          <span className="leading-snug text-gray-300">{e.message}</span>
          <span className="text-right text-gray-600">{e.ago}</span>
        </div>
      ))}
    </div>
  );
}
