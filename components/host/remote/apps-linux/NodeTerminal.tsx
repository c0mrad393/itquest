"use client";

/**
 * NodeTerminal — interactive CLI bound to a Linux node
 * ----------------------------------------------------
 * Reuses the Phase-1 terminal UX, but every command runs through
 * useInfraStore.runLinuxCommand(nodeId, …) — i.e. the shared engine mutating the
 * node inside InfrastructureState. Fixing the 502 here (`systemctl start app`)
 * changes the SAME node the Gateway health and the ticket reconciler read.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { LinuxNodeState } from "@/lib/core";

interface Line {
  id: number;
  kind: "input" | "output" | "system";
  text: string;
  bad?: boolean;
}

function shortCwd(node: LinuxNodeState): string {
  const home = node.session.env.HOME ?? `/home/${node.session.user}`;
  if (node.session.cwd === home) return "~";
  if (node.session.cwd.startsWith(home + "/")) return "~" + node.session.cwd.slice(home.length);
  return node.session.cwd;
}

export default function NodeTerminal({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as LinuxNodeState | undefined;
  const run = useInfraStore((s) => s.runLinuxCommand);

  const [lines, setLines] = useState<Line[]>(() => [
    { id: 0, kind: "system", text: `Welcome to Ubuntu 22.04.3 LTS — type \`help\` for available commands.` },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const seq = useRef(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines.length]);

  const prompt = useMemo(
    () => (node ? `${node.session.user}@${node.hostname}:${shortCwd(node)}$` : "$"),
    [node],
  );

  if (!node) return null;

  function submit() {
    const cmd = input;
    const promptEcho = `${prompt} ${cmd}`;
    const next: Line[] = [{ id: seq.current++, kind: "input", text: promptEcho }];

    if (cmd.trim() === "clear") {
      setLines([]);
      setInput("");
      setHistIdx(null);
      setHistory((h) => [...h, cmd]);
      return;
    }

    const result = run(nodeId, cmd);
    if (result.output.startsWith("\x1b[2J")) {
      setLines([]);
    } else {
      if (result.output !== "") {
        next.push({
          id: seq.current++,
          kind: "output",
          text: result.output,
          bad: result.exitCode !== 0,
        });
      }
      setLines((l) => [...l, ...next]);
    }
    if (cmd.trim()) setHistory((h) => [...h, cmd]);
    setInput("");
    setHistIdx(null);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-term font-mono text-[13px]"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="term-scroll flex-1 overflow-y-auto px-4 py-3 leading-relaxed">
        {lines.map((ln) => (
          <TermLine key={ln.id} line={ln} />
        ))}
        <div className="flex items-start">
          <span className="whitespace-nowrap text-accent">{prompt}&nbsp;</span>
          <span className="flex-1 whitespace-pre-wrap break-all text-gray-100">
            {input}
            <span className="caret text-gray-100">▋</span>
          </span>
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          className="absolute h-0 w-0 opacity-0"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}

function TermLine({ line }: { line: Line }) {
  if (line.kind === "input") {
    const idx = line.text.indexOf("$ ");
    const p = idx >= 0 ? line.text.slice(0, idx + 1) : "";
    const c = idx >= 0 ? line.text.slice(idx + 2) : line.text;
    return (
      <div className="whitespace-pre-wrap break-all">
        <span className="text-accent">{p} </span>
        <span className="text-gray-100">{c}</span>
      </div>
    );
  }
  if (line.kind === "system") {
    return <div className="mb-1 whitespace-pre-wrap break-all text-gray-500">{line.text}</div>;
  }
  return (
    <div className={`whitespace-pre-wrap break-all ${line.bad ? "text-danger" : "text-gray-300"}`}>
      {line.text}
    </div>
  );
}
