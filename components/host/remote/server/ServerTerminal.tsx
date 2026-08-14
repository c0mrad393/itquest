"use client";

/**
 * ServerOS Console — a small administrative shell on a server (v0.8.1)
 * ====================================================================
 * Not a second Linux interpreter. The Linux nodes have a real one
 * (lib/vm/interpreter.ts, wired through NodeTerminal); this is the handful of
 * read-only administrative commands a server console is genuinely used for
 * when you are already sitting in front of the machine.
 *
 * Deliberately read-only. Everything that CHANGES the estate lives in the
 * Admin Center, where the change is visible and reversible. A console that
 * could quietly mutate the directory would give the operator two places to do
 * the same job and one of them would drift.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useMemo, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState } from "@/lib/core";
import { SERVER_OS, SERVER_OS_FULL, resolvePolicies, scopeChain } from "@/lib/core";

interface Line {
  kind: "in" | "out" | "err";
  text: string;
}

export default function ServerTerminal({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const node = infra.nodes[nodeId] as WindowsNodeState | undefined;
  const [lines, setLines] = useState<Line[]>(() => [
    { kind: "out", text: `${SERVER_OS_FULL}` },
    { kind: "out", text: `Type 'help' for the available commands.` },
  ]);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const prompt = useMemo(() => `PS ${node?.hostname ?? "?"}\\> `, [node]);

  function run(raw: string) {
    const cmd = raw.trim();
    const out: Line[] = [{ kind: "in", text: prompt + cmd }];
    const say = (t: string) => out.push({ kind: "out", text: t });
    const err = (t: string) => out.push({ kind: "err", text: t });

    const [verb, ...args] = cmd.split(/\s+/);
    switch ((verb ?? "").toLowerCase()) {
      case "":
        break;
      case "help":
        say("hostname            this server's name");
        say("get-service         installed services and their state");
        say("get-eds-user <sam>  look up a directory account");
        say("get-fleet-policy    settings in force on an organizational unit");
        say("clear               clear the console");
        break;
      case "hostname":
        say(node?.hostname ?? "unknown");
        break;
      case "get-service": {
        const services = Object.values(node?.services ?? {});
        if (!services.length) { err("No services registered on this host."); break; }
        say("Status    Name              DisplayName");
        for (const s of services) {
          say(`${s.status.padEnd(9)} ${s.name.padEnd(17)} ${s.displayName}`);
        }
        break;
      }
      case "get-eds-user": {
        const sam = args[0];
        if (!sam) { err("Usage: get-eds-user <samAccountName>"); break; }
        const ad = node?.activeDirectory;
        if (!ad) { err("This host does not serve the directory."); break; }
        const u = ad.users.find((x) => x.samAccountName.toLowerCase() === sam.toLowerCase());
        if (!u) { err(`No account named ${sam}.`); break; }
        say(`DisplayName   : ${u.displayName}`);
        say(`Title         : ${u.title}`);
        say(`Department    : ${u.department}`);
        say(`Manager       : ${u.manager ?? "(none)"}`);
        say(`Enabled       : ${u.enabled}`);
        say(`LockedOut     : ${u.locked}`);
        say(`MustChangePwd : ${u.mustChangePassword}`);
        say(`DistinguishedName : ${u.ou}`);
        break;
      }
      case "get-fleet-policy": {
        const ad = node?.activeDirectory;
        if (!ad) { err("This host does not serve the directory."); break; }
        const name = args.join(" ");
        const ou = name
          ? ad.ous.find((o) => o.name.toLowerCase() === name.toLowerCase())
          : ad.ous[0];
        if (!ou) { err(`No organizational unit named ${name}.`); break; }
        say(`Resulting settings for ${ou.name}`);
        say(`Scope: ${scopeChain(ou.dn).join(" -> ")}`);
        const resolved = resolvePolicies(infra.policy, ou.dn);
        if (!resolved.size) { say("(nothing applies)"); break; }
        for (const a of resolved.values()) {
          say(`${a.key.padEnd(24)} ${String(a.value).padEnd(10)} via ${a.policyName}${a.enforced ? " [enforced]" : ""}`);
        }
        break;
      }
      case "clear":
        setLines([]);
        setInput("");
        return;
      default:
        err(`'${verb}' is not recognized. Type 'help'.`);
    }

    setLines((l) => [...l, ...out]);
    setInput("");
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }

  return (
    <div className="flex h-full flex-col bg-[#0c0c0c] font-mono text-[11px] text-gray-300">
      <div className="shrink-0 border-b border-black/60 bg-[#1b1f24] px-2 py-1 text-[10px] text-gray-400">
        {SERVER_OS} Console
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-2 leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={l.kind === "in" ? "text-gray-500" : l.kind === "err" ? "text-danger" : "text-gray-300"}
          >
            {l.text || " "}
          </div>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); run(input); }}
          className="flex items-center gap-1"
        >
          <span className="shrink-0 text-emerald-400">{prompt}</span>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-gray-100 outline-none"
          />
        </form>
      </div>
    </div>
  );
}
