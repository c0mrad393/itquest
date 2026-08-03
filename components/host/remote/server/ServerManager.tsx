"use client";

/**
 * ServerManager — a mockup of the Windows Server 2022 "Server Manager" console.
 * Dashboard with the Welcome quick-start, plus Roles & Server Groups tiles whose
 * Manageability / Services counts derive from the live node health + services.
 */

import type { WindowsNodeState } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";

type ServerApp = "servermgr" | "aduc" | "gpmc" | "services" | "eventvwr" | "controlpanel" | "explorer" | "powershell";

export default function ServerManager({ node, onOpen }: { node: WindowsNodeState; onOpen: (a: ServerApp) => void }) {
  const services = Object.values(node.services);
  const running = services.filter((s) => s.status === "Running").length;
  const stopped = services.length - running;
  const healthy = node.health.status === "healthy";

  const NAV = ["Dashboard", "Local Server", "All Servers", node.activeDirectory ? "AD DS" : null, "DNS", "File and Storage Services"].filter(Boolean) as string[];

  return (
    <div className="flex h-full flex-col bg-[#e6e6e6] text-[#1f1f1f]">
      {/* Title / breadcrumb bar */}
      <div className="flex items-center gap-2 bg-[#2b5797] px-3 py-1.5 text-[12px] text-white">
        <span><AppIcon id="server" size={17} /></span>
        <span className="font-semibold">Server Manager</span>
        <span className="text-white/60">·</span>
        <span className="text-white/80">Dashboard</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <div className="w-40 shrink-0 border-r border-[#c8c8c8] bg-[#f4f4f4] py-2 text-[12px]">
          {NAV.map((n, i) => (
            <div key={n} className={`cursor-default px-3 py-1.5 ${i === 0 ? "bg-[#cde0f4] font-semibold text-[#12395f]" : "text-[#333] hover:bg-[#e3eefa]"}`}>{n}</div>
          ))}
        </div>

        {/* Main */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Welcome */}
          <div className="mb-4 rounded-sm border border-[#c8c8c8] bg-white">
            <div className="bg-[#2b5797] px-3 py-1 text-[12px] font-semibold text-white">WELCOME TO SERVER MANAGER</div>
            <ol className="space-y-1 p-3 text-[12px]">
              <QuickStart n={1} label="Configure this local server" onClick={() => onOpen("controlpanel")} />
              <QuickStart n={2} label="Add roles and features" />
              <QuickStart n={3} label="Add other servers to manage" />
              <QuickStart n={4} label="Create a server group" />
            </ol>
          </div>

          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#5a5a5a]">Roles and Server Groups</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {node.activeDirectory && (
              <RoleTile title="AD DS" ok={healthy} onManage={() => onOpen("aduc")} rows={[["Manageability", "Online"], ["Events", healthy ? "0" : "2"], ["Services", `${running} running`], ["Performance", "OK"], ["BPA results", "0"]]} />
            )}
            <RoleTile title="DNS" ok={healthy} onManage={() => onOpen("services")} rows={[["Manageability", "Online"], ["Events", "0"], ["Services", `${running} running`], ["Performance", "OK"], ["BPA results", "0"]]} />
            <RoleTile title="File and Storage Services" ok={healthy} onManage={() => onOpen("explorer")} rows={[["Manageability", "Online"], ["Events", "0"], ["Services", `${running} running`], ["Performance", "OK"], ["BPA results", "0"]]} />
            <RoleTile title="Local Server" ok={healthy} onManage={() => onOpen("eventvwr")} rows={[["Manageability", healthy ? "Online" : "Alert"], ["Events", stopped > 0 ? String(stopped) : "0"], ["Services", `${running}/${services.length}`], ["Performance", healthy ? "OK" : "High"], ["BPA results", "0"]]} />
          </div>

          <div className="mt-4 text-[11px] text-[#777]">{node.hostname} · {node.edition} · Build {node.build}{node.isDomainController ? " · Domain Controller" : ""}</div>
        </div>
      </div>
    </div>
  );
}

function QuickStart({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2b5797] text-[10px] font-semibold text-white">{n}</span>
      <button onClick={onClick} disabled={!onClick} className={`text-[#0b5394] ${onClick ? "hover:underline" : "cursor-default text-[#333]"}`}>{label}</button>
    </li>
  );
}

function RoleTile({ title, ok, rows, onManage }: { title: string; ok: boolean; rows: [string, string][]; onManage: () => void }) {
  return (
    <div className="overflow-hidden rounded-sm border border-[#c8c8c8] bg-white shadow-sm">
      <button onClick={onManage} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-[#1f4e79] hover:bg-[#eef4fb]">
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} /> {title}
      </button>
      <div className="divide-y divide-[#eee] text-[11px]">
        {rows.map(([k, v]) => (
          <div key={k} className={`flex items-center justify-between px-3 py-1 ${!ok && (k === "Manageability" || k === "Performance") ? "bg-[#fde7e9]" : ""}`}>
            <span className="text-[#555]">{k}</span>
            <span className="text-[#1f1f1f]">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
