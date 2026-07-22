"use client";

import { useState } from "react";
import Terminal from "@/components/workspace/Terminal";
import Desktop from "@/components/desktop/Desktop";
import { useVMStore } from "@/lib/vm/store";

type Mode = "cli" | "gui";

export default function WorkspacePage() {
  const vm = useVMStore((s) => s.vm);
  const resolved = useVMStore((s) => s.resolved);
  const reset = useVMStore((s) => s.reset);
  const [mode, setMode] = useState<Mode>("cli");

  return (
    <main className="mx-auto flex h-screen max-w-[1500px] flex-col gap-4 p-4">
      {/* Ticket header strip */}
      <header className="flex items-center gap-4 rounded-lg border border-edge bg-panel px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-info/20 text-info">
          ◈
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-100">
            TriageOS · <span className="text-info">TCK-4821</span> — web-01 returning 502 Bad Gateway
          </div>
          <div className="text-xs text-gray-500">
            Track: Sysadmin · Severity: <span className="text-warn">High</span> · Persona:{" "}
            <span className="text-gray-300">Priya (Stressed)</span>
          </div>
        </div>

        {/* Workspace switcher — same VMState, two interfaces */}
        <div className="ml-auto flex items-center rounded-lg border border-edge bg-panelalt p-0.5 text-xs">
          <ModeBtn active={mode === "cli"} onClick={() => setMode("cli")}>
            ▚ CLI Terminal
          </ModeBtn>
          <ModeBtn active={mode === "gui"} onClick={() => setMode("gui")}>
            ◱ Remote Desktop
          </ModeBtn>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            resolved ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"
          }`}
        >
          {resolved ? "● RESOLVED" : "● ACTIVE INCIDENT"}
        </span>
        <button
          onClick={reset}
          className="rounded border border-edge bg-panelalt px-3 py-1 text-xs text-gray-400 hover:text-gray-100"
        >
          Reset
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Active workspace. Both are mounted-on-demand but share one VMState,
            so switching modes never loses machine state. */}
        {mode === "cli" ? <Terminal /> : <Desktop />}

        {/* Live system panel — reads the SAME VMState both workspaces mutate */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <Panel title="Services">
            {Object.values(vm.services).map((s) => (
              <div key={s.name} className="flex items-center justify-between py-1 text-xs">
                <span className="text-gray-300">{s.name}</span>
                <StatusPill status={s.status} />
              </div>
            ))}
          </Panel>

          <Panel title="Network Interfaces">
            {vm.network.interfaces.map((i) => (
              <div key={i.name} className="flex items-center justify-between py-1 text-xs">
                <span className="text-gray-300">
                  {i.name} <span className="text-gray-500">{i.ipv4 ?? "—"}</span>
                </span>
                <span className={i.up ? "text-accent" : "text-gray-600"}>
                  {i.up ? "UP" : "DOWN"}
                </span>
              </div>
            ))}
          </Panel>

          <Panel title="Shared-state demo">
            <p className="text-xs leading-relaxed text-gray-400">
              Fix the 502 in <span className="text-info">either</span> workspace:
              <br />• <span className="text-gray-300">CLI:</span>{" "}
              <span className="text-accent">systemctl start app</span>
              <br />• <span className="text-gray-300">GUI:</span> open{" "}
              <span className="text-gray-300">Services</span> → Start{" "}
              <span className="text-gray-300">app</span>
              <br />
              Both resolve the same ticket — one machine, two views.
            </p>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-medium transition ${
        active ? "bg-info/20 text-info" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel">
      <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-accent/20 text-accent",
    failed: "bg-danger/20 text-danger",
    inactive: "bg-gray-700/40 text-gray-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        map[status] ?? "bg-gray-700/40 text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}
