"use client";

/**
 * ITQuest — Interactive endpoint file system
 * ===========================================
 * A small window manager (useEndpointWM) plus the window bodies that make the
 * mini Windows/macOS desktops feel real:
 *   • SystemBrowser  — This PC (Windows) / Finder (macOS): disks, user folders,
 *                      and live network shares (mapped drives).
 *   • FolderView     — a folder's contents; double-click to descend.
 *   • FileViewer     — unified Text / Spreadsheet / Image / binary viewers.
 *   • CredentialPrompt — realistic unlock dialog for password-protected items.
 *
 * Mapped-drive status and local disk capacity are DERIVED from live
 * InfrastructureState, so a downed file server or a full C: drive shows here.
 */

import { useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { fileGlyph, type HostAppIconId, type EndpointFsItem, type DesktopItem, type MacNodeState, type WindowsNodeState } from "@/lib/core";
import { resolveDriveStatus, diskInfo, formatBytesFromGb } from "@/lib/infra/shares";
import { AppIcon } from "@/components/ui/app-icons";

export type OsVariant = "windows" | "macos";

// ── Window model ─────────────────────────────────────────────────────────────

export type EpWindowContent =
  | { kind: "app"; appId: string }
  | { kind: "system" }
  | { kind: "folder"; items: EndpointFsItem[] }
  | { kind: "file"; item: EndpointFsItem }
  | { kind: "credential"; item: EndpointFsItem; onUnlock: () => void };

export interface EpWindow {
  id: string;
  title: string;
  icon: HostAppIconId;
  content: EpWindowContent;
  z: number;
}

export function toFsItem(d: DesktopItem): EndpointFsItem {
  return {
    id: d.id,
    name: d.name,
    isFolder: d.kind === "folder",
    ext: d.ext,
    isLocked: d.isLocked,
    passwordHint: d.passwordHint,
    password: d.password,
    content: d.content,
    children: d.children,
  };
}

export interface EndpointWM {
  windows: EpWindow[];
  focusId: string | null;
  open: (w: Omit<EpWindow, "z">) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  /** Open an FS item, routing folders/files/locked items to the right window. */
  openItem: (item: EndpointFsItem) => void;
  openSystem: () => void;
}

let seq = 0;

export function useEndpointWM(variant: OsVariant): EndpointWM {
  const [windows, setWindows] = useState<EpWindow[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const unlocked = useRef<Set<string>>(new Set());
  const zRef = useRef(10);

  function open(w: Omit<EpWindow, "z">) {
    zRef.current += 1;
    const z = zRef.current;
    setWindows((prev) => {
      const existing = prev.find((p) => p.id === w.id);
      if (existing) return prev.map((p) => (p.id === w.id ? { ...p, z } : p));
      return [...prev, { ...w, z }];
    });
    setFocusId(w.id);
  }
  function close(id: string) {
    setWindows((prev) => prev.filter((p) => p.id !== id));
    setFocusId((cur) => (cur === id ? null : cur));
  }
  function focus(id: string) {
    zRef.current += 1;
    const z = zRef.current;
    setWindows((prev) => prev.map((p) => (p.id === id ? { ...p, z } : p)));
    setFocusId(id);
  }

  function reallyOpen(item: EndpointFsItem) {
    if (item.isFolder) {
      open({ id: `folder-${item.id}`, title: item.name, icon: "folder", content: { kind: "folder", items: item.children ?? [] } });
    } else {
      open({ id: `file-${item.id}`, title: item.name, icon: fileGlyph({ kind: "file", ext: item.ext }), content: { kind: "file", item } });
    }
  }

  function openItem(item: EndpointFsItem) {
    if (item.isLocked && !unlocked.current.has(item.id)) {
      const credId = `cred-${item.id}`;
      open({
        id: credId,
        title: variant === "windows" ? "Windows Security" : "Authenticate",
        icon: "folder-locked",
        content: {
          kind: "credential",
          item,
          onUnlock: () => {
            unlocked.current.add(item.id);
            close(credId);
            reallyOpen(item);
          },
        },
      });
      return;
    }
    reallyOpen(item);
  }

  function openSystem() {
    open({
      id: "system",
      title: variant === "windows" ? "This PC" : "Finder",
      icon: variant === "windows" ? "disk" : "folder",
      content: { kind: "system" },
    });
  }

  return { windows, focusId, open, close, focus, openItem, openSystem };
}

// ── Body renderer ────────────────────────────────────────────────────────────

export function renderEpBody(
  win: EpWindow,
  ctx: { nodeId: string; variant: OsVariant; wm: EndpointWM; renderApp: (appId: string) => React.ReactNode },
): React.ReactNode {
  const c = win.content;
  switch (c.kind) {
    case "app":
      return ctx.renderApp(c.appId);
    case "system":
      return <SystemBrowser nodeId={ctx.nodeId} variant={ctx.variant} openItem={ctx.wm.openItem} />;
    case "folder":
      return <FolderView items={c.items} openItem={ctx.wm.openItem} />;
    case "file":
      return <FileViewer item={c.item} />;
    case "credential":
      return <CredentialPrompt item={c.item} variant={ctx.variant} onUnlock={c.onUnlock} onCancel={() => ctx.wm.close(win.id)} />;
  }
}

// ── Folder view ──────────────────────────────────────────────────────────────

export function FolderView({ items, openItem }: { items: EndpointFsItem[]; openItem: (i: EndpointFsItem) => void }) {
  return (
    <div className="h-full overflow-y-auto bg-panel p-3">
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-gray-600">This folder is empty.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1">
          {items.map((it) => (
            <button
              key={it.id}
              onDoubleClick={() => openItem(it)}
              title={`${it.name} — double-click to open`}
              className="flex flex-col items-center gap-1 rounded-md p-2 text-center hover:bg-gray-500/15"
            >
              <span className="relative text-[26px] leading-none">
                <AppIcon id={it.isFolder ? "folder" : fileGlyph({ kind: "file", ext: it.ext })} size={18} />
                {it.isLocked && <span className="absolute -bottom-1 -right-1 text-[12px]"><AppIcon id="lock" size={12} /></span>}
              </span>
              <span className="w-full truncate text-[10px] text-gray-200">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unified file viewer ──────────────────────────────────────────────────────

export function FileViewer({ item }: { item: EndpointFsItem }) {
  const ext = (item.ext ?? "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext);
  const isSheet = ["csv", "tsv", "xlsx", "xls"].includes(ext);
  const isText = ["txt", "log", "md", "json", "ini", "cfg", "sh", "py", "js"].includes(ext);

  if (isImage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#101418] p-4">
        <div className="flex h-40 w-64 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-4xl shadow-inner"><AppIcon id="file-image" size={34} /></div>
        <div className="text-xs text-gray-400">{item.name}</div>
        <div className="text-[10px] text-gray-600">Image preview · {ext.toUpperCase()}</div>
      </div>
    );
  }

  if (isSheet) {
    const rows = (item.content ?? "").trim().split(/\r?\n/).filter(Boolean).map((r) => r.split(/[,\t]/));
    return (
      <div className="h-full overflow-auto bg-white text-brand-on">
        <div className="flex items-center gap-2 border-b border-gray-300 bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white">
          <span><AppIcon id="file-sheet" size={13} /></span> {item.name}
        </div>
        {rows.length ? (
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r} className={r === 0 ? "bg-[#e8f2ec] font-semibold" : ""}>
                  <td className="w-8 border border-gray-200 bg-gray-100 px-1 text-center text-gray-500">{r + 1}</td>
                  {cells.map((cell, ci) => (
                    <td key={ci} className="border border-gray-200 px-2 py-0.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-xs text-gray-500">Spreadsheet has no cached preview data.</div>
        )}
      </div>
    );
  }

  if (isText || item.content) {
    return (
      <div className="flex h-full flex-col bg-white text-brand-on">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
          <span><AppIcon id="file-text" size={13} /></span> {item.name} — Text Editor
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed text-gray-800">
          {item.content ?? "(empty file)"}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel text-center">
      <div className="text-gray-400"><AppIcon id={fileGlyph({ kind: "file", ext })} size={30} /></div>
      <div className="text-sm text-gray-200">{item.name}</div>
      <div className="text-[11px] text-gray-500">No preview available for .{ext || "bin"} files.</div>
    </div>
  );
}

// ── Credential prompt (locked items) ─────────────────────────────────────────

export function CredentialPrompt({
  item,
  variant,
  onUnlock,
  onCancel,
}: {
  item: EndpointFsItem;
  variant: OsVariant;
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  function submit() {
    if (item.password && value === item.password) onUnlock();
    else setError(true);
  }
  return (
    <div className="flex h-full flex-col items-center justify-center bg-panel/80 p-4">
      <div className="w-[300px] overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl">
        <div className="flex items-center gap-2 bg-panelalt px-3 py-2 text-xs font-semibold text-gray-200">
          <AppIcon id="lock" size={12} /> {variant === "windows" ? "Windows Security" : "Authentication Required"}
        </div>
        <div className="space-y-3 p-4 text-xs">
          <div className="text-gray-300">Enter the password to unlock <span className="font-semibold">{item.name}</span>.</div>
          {item.passwordHint && <div className="rounded bg-brand-fill px-2 py-1 text-[11px] text-info">Hint: {item.passwordHint}</div>}
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className={`w-full rounded border bg-panelalt px-2 py-1.5 font-mono text-gray-100 outline-none ${error ? "border-danger" : "border-edge focus:border-info"}`}
          />
          {error && <div className="text-[11px] text-danger">The password is incorrect. Try again.</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCancel} className="rounded border border-edge px-3 py-1 text-gray-300 hover:bg-panelalt">Cancel</button>
            <button onClick={submit} className="rounded bg-brand-fill px-3 py-1 font-semibold text-brand-on hover:bg-brand-hover">Unlock</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── This PC / Finder ─────────────────────────────────────────────────────────

type Loc = "home" | "desktop" | "documents" | "downloads";

export function SystemBrowser({
  nodeId,
  variant,
  openItem,
}: {
  nodeId: string;
  variant: OsVariant;
  openItem: (i: EndpointFsItem) => void;
}) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | MacNodeState | undefined;
  const infra = useInfraStore((s) => s.infra);
  const [loc, setLoc] = useState<Loc>("home");
  if (!node) return null;

  const visual = node.visualState;
  const disk = diskInfo(visual?.diskTotalGb ?? 512, node.health.diskUsedPct);
  const drives = node.mappedDrives ?? [];

  const desktopItems: EndpointFsItem[] = (visual?.desktop ?? [])
    .filter((d) => d.kind !== "app")
    .map(toFsItem);
  const documents = visual?.documents ?? [];
  const downloads = visual?.downloads ?? [];

  const sidebar =
    variant === "windows"
      ? [
          { id: "home", label: "This PC", icon: "disk" as const },
          { id: "desktop", label: "Desktop", icon: "monitor" as const },
          { id: "documents", label: "Documents", icon: "folder" as const },
          { id: "downloads", label: "Downloads", icon: "inbox" as const },
        ]
      : [
          { id: "home", label: "Macintosh HD", icon: "disk" as const },
          { id: "desktop", label: "Desktop", icon: "monitor" as const },
          { id: "documents", label: "Documents", icon: "folder" as const },
          { id: "downloads", label: "Downloads", icon: "inbox" as const },
        ];

  const folderFor: Record<Loc, EndpointFsItem[]> = {
    home: [],
    desktop: desktopItems,
    documents,
    downloads,
  };

  return (
    <div className="flex h-full bg-panel text-gray-200">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-edge bg-panelalt/60 p-2 text-xs">
        <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
          {variant === "windows" ? "Quick access" : "Favorites"}
        </div>
        {variant === "macos" && (
          <SideRow icon="link" label="AirDrop" />
        )}
        {variant === "macos" && <SideRow icon="grid" label="Applications" />}
        {sidebar.map((s) => (
          <SideRow key={s.id} icon={s.icon} label={s.label} active={loc === s.id} onClick={() => setLoc(s.id as Loc)} />
        ))}

        <div className="mb-1 mt-3 px-2 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
          {variant === "windows" ? "Network locations" : "Shared"}
        </div>
        {drives.length === 0 && <div className="px-2 py-1 text-[10px] text-gray-600">No mapped shares.</div>}
        {drives.map((d) => {
          const status = resolveDriveStatus(infra, d);
          const bad = status !== "connected";
          return (
            <div key={d.letter} className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px]">
              <span className="relative">
                <AppIcon id="server" size={26} />
                {bad && <span className="absolute -right-1 -top-1 text-[10px] text-danger">✕</span>}
              </span>
              <span className={`min-w-0 flex-1 truncate ${bad ? "text-gray-500 line-through" : "text-gray-200"}`}>
                {variant === "windows" ? `${d.letter} ` : ""}{d.shareName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main pane */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt/40 px-3 py-1.5 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-200">
            {loc === "home" ? (variant === "windows" ? "This PC" : "Macintosh HD") : sidebar.find((s) => s.id === loc)?.label}
          </span>
          <span className="ml-auto font-mono text-[10px] text-gray-500">{node.hostname}</span>
        </div>

        {loc === "home" ? (
          <div className="space-y-4 p-3">
            {/* Local disk */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {variant === "windows" ? "Devices and drives" : "Locations"}
              </div>
              <DiskCard variant={variant} disk={disk} />
            </div>

            {/* Network locations */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {variant === "windows" ? "Network locations" : "Shared servers"}
              </div>
              {drives.length === 0 ? (
                <div className="text-[11px] text-gray-600">No network drives mapped on this machine.</div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {drives.map((d) => {
                    const status = resolveDriveStatus(infra, d);
                    return <ShareCard key={d.letter} letter={d.letter} path={d.remotePath} status={status} variant={variant} />;
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <FolderView items={folderFor[loc]} openItem={openItem} />
        )}
      </div>
    </div>
  );
}

/**
 * `onClick` is optional: some sidebar entries are SET DRESSING — AirDrop and
 * Applications exist because a Finder without them does not look like a
 * Finder, and neither has anything to show in a simulator. They previously
 * rendered as buttons with an empty handler, which is a small dead end: it
 * invites a click and answers with nothing. Without a handler they render as
 * plain, unclickable rows, which is honest about what they are.
 */
function SideRow({ icon, label, active, onClick }: { icon: HostAppIconId; label: string; active?: boolean; onClick?: () => void }) {
  if (!onClick) {
    return (
      <div className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-gray-600">
        <AppIcon id={icon} size={14} />
        <span className="truncate">{label}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] ${active ? "bg-info/15 text-gray-100" : "text-gray-300 hover:bg-gray-500/15"}`}
    >
      <AppIcon id={icon} size={14} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function DiskCard({ variant, disk }: { variant: OsVariant; disk: ReturnType<typeof diskInfo> }) {
  const label = variant === "windows" ? "Local Disk (C:)" : "Macintosh HD";
  const barColor = disk.critical ? "bg-danger" : disk.usedPct >= 88 ? "bg-amber-400" : "bg-info";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-edge bg-panelalt/60 p-3">
      <span className="text-2xl"><AppIcon id="disk" size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-gray-100">{label}</span>
          <span className={`text-[10px] ${disk.critical ? "font-semibold text-danger" : "text-gray-500"}`}>
            {disk.critical ? "0 bytes free — drive full" : `${formatBytesFromGb(disk.freeGb)} free of ${disk.totalGb} GB`}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-500/25">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, disk.usedPct)}%` }} />
        </div>
        {disk.critical && (
          <div className="mt-1 text-[10px] text-danger">Disk full — apps may crash. Free space (log rotation) to recover.</div>
        )}
      </div>
    </div>
  );
}

function ShareCard({
  letter,
  path,
  status,
  variant,
}: {
  letter: string;
  path: string;
  status: "connected" | "disconnected" | "auth_error";
  variant: OsVariant;
}) {
  const ok = status === "connected";
  const label = status === "connected" ? "Connected" : status === "auth_error" ? "Access denied" : "Disconnected";
  const tone = ok ? "text-emerald-300" : status === "auth_error" ? "text-amber-300" : "text-danger";
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${ok ? "border-edge bg-panelalt/60" : "border-danger/40 bg-danger/5"}`}>
      <span className="relative text-2xl">
        <AppIcon id="server" size={26} />
        {!ok && <span className="absolute -right-1 -top-1 text-sm font-bold text-danger">✕</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-gray-100">
          {variant === "windows" ? `${letter} ` : ""}({path})
        </div>
        <div className={`text-[10px] ${tone}`}>{label}</div>
      </div>
    </div>
  );
}
