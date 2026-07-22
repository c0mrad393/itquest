"use client";

/**
 * TriageOS — Terminal surface
 * ---------------------------
 * A line-oriented terminal bound to the shared VM store. It renders the
 * structured scrollback (input echoes, command output, engine notices) and
 * captures keystrokes: Enter to run, ↑/↓ to recall history, Tab to complete,
 * Ctrl+L to clear.
 *
 * It is a pure VIEW: all state changes go through useVMStore.execute(), the
 * same entry point the GUI window-manager will use — guaranteeing both
 * workspaces mutate one authoritative machine.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { shortCwd, useVMStore } from "@/lib/vm/store";

export default function Terminal() {
  const vm = useVMStore((s) => s.vm);
  const history = useVMStore((s) => s.history);
  const commandLog = useVMStore((s) => s.commandLog);
  const execute = useVMStore((s) => s.execute);
  const interpreter = useVMStore((s) => s.interpreter);

  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [focused, setFocused] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new output.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history.length]);

  const prompt = useMemo(
    () => `${vm.currentUser}@${vm.hostname}:${shortCwd(vm)}$`,
    [vm],
  );

  function submit() {
    execute(input);
    setInput("");
    setHistIdx(null);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      useVMStore.getState().clearScreen();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandLog.length === 0) return;
      const idx = histIdx === null ? commandLog.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(commandLog[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= commandLog.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(commandLog[idx]);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const parts = input.split(" ");
      if (parts.length === 1 && parts[0]) {
        const matches = interpreter
          .list()
          .map((c) => c.name)
          .filter((n) => n.startsWith(parts[0]));
        if (matches.length === 1) setInput(matches[0] + " ");
      }
      return;
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-lg border border-edge bg-term shadow-2xl"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-2 text-xs text-gray-400">
        <span className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-danger" />
          <span className="h-3 w-3 rounded-full bg-warn" />
          <span className="h-3 w-3 rounded-full bg-accent" />
        </span>
        <span className="ml-2 select-none">
          triage@console — /bin/bash — {vm.hostname}
        </span>
        <span className="ml-auto rounded bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wider text-info">
          CLI
        </span>
      </div>

      {/* Scrollback */}
      <div
        ref={scrollRef}
        className="term-scroll flex-1 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
      >
        <div className="mb-2 text-gray-500">
          TriageOS virtual console — type <span className="text-info">help</span> for available
          commands.
        </div>
        {history.map((ln) => (
          <Line key={ln.id} kind={ln.kind} text={ln.text} exitCode={ln.exitCode} />
        ))}

        {/* Live input line */}
        <div className="flex items-start">
          <span className="whitespace-nowrap text-accent">{prompt}&nbsp;</span>
          <span className="relative flex-1 whitespace-pre-wrap break-all text-gray-100">
            {input}
            {focused && <span className="caret text-gray-100">▋</span>}
          </span>
        </div>

        {/* Hidden real input capturing keystrokes */}
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute h-0 w-0 opacity-0"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}

function Line({
  kind,
  text,
  exitCode,
}: {
  kind: "input" | "output" | "system";
  text: string;
  exitCode?: number;
}) {
  if (kind === "input") {
    // "user@host:cwd$ command" — colorize the prompt portion.
    const idx = text.indexOf("$ ");
    const promptPart = idx >= 0 ? text.slice(0, idx + 1) : "";
    const cmdPart = idx >= 0 ? text.slice(idx + 2) : text;
    return (
      <div className="whitespace-pre-wrap break-all">
        <span className="text-accent">{promptPart} </span>
        <span className="text-gray-100">{cmdPart}</span>
      </div>
    );
  }
  if (kind === "system") {
    return (
      <div className="my-1 whitespace-pre-wrap break-all rounded border border-accent/40 bg-accent/10 px-2 py-1 text-accent">
        {text}
      </div>
    );
  }
  const color = exitCode && exitCode !== 0 ? "text-danger" : "text-gray-300";
  return <div className={`whitespace-pre-wrap break-all ${color}`}>{text}</div>;
}
