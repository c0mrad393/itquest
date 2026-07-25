"use client";

/**
 * ImagingSuite — manual multi-step OS deployment (v2)
 * ===================================================
 * Replaces the auto progress bar with real work:
 *   partition → manual Disk Management (EFI / MSR / primary, in order)
 *   applying  → image copy; trips "Hardware Interrupt/Power Error" if the
 *               assembly left screws/battery/cables incomplete
 *   network   → manual TCP/IP (IP / mask / gateway from the node's schema)
 *   domain    → join (or unjoin+rejoin for a trust repair) with the specific
 *               high-privilege domain admin credential
 */

import { useEffect, useRef, useState } from "react";
import { LAB_ADMIN, LAB_DOMAIN, type ImagingSpec, type PartitionKind } from "@/lib/hardware/types";

export interface NetExpectation { ip: string; mask: string; gateway: string }

type Phase = "partition" | "applying" | "network" | "unjoin" | "domain" | "done";

const PART_META: Record<PartitionKind, { label: string; size: string; color: string }> = {
  EFI: { label: "EFI System Partition · FAT32", size: "100 MB", color: "bg-sky-500" },
  MSR: { label: "Microsoft Reserved (MSR)", size: "16 MB", color: "bg-violet-500" },
  WINDOWS: { label: "Windows (C:) · NTFS", size: "rest", color: "bg-emerald-500" },
  LINUX: { label: "Linux root · ext4", size: "rest", color: "bg-amber-500" },
};

export default function ImagingSuite({
  spec, host, net, assemblyFaulty, assemblyFault, onFault, onComplete,
}: {
  spec: ImagingSpec;
  host: string;
  net: NetExpectation;
  assemblyFaulty: boolean;
  assemblyFault?: string;
  onFault: () => void;
  onComplete: () => void;
}) {
  const seq: Phase[] =
    spec.mode === "repair"
      ? ["unjoin", "domain"]
      : (["partition", "applying", "network", "domain"] as Phase[]).filter(
          (p) => p === "partition" || p === "applying" || spec.phases.includes(p as "network" | "domain"),
        );
  const [i, setI] = useState(0);
  const phase = seq[i] ?? "done";
  function next() { setI((n) => Math.min(n + 1, seq.length)); }
  const completed = useRef(false);
  useEffect(() => {
    if ((phase === "done" || i >= seq.length) && !completed.current) { completed.current = true; onComplete(); }
    /* eslint-disable-next-line */
  }, [i]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* phase rail */}
      <div className="mb-3 flex items-center gap-2 text-[10px] text-gray-500">
        {seq.map((p, idx) => (
          <span key={p} className={`rounded-full px-2 py-0.5 ${idx === i ? "bg-info/20 text-info" : idx < i ? "text-emerald-400" : "text-gray-600"}`}>{idx < i ? "✓ " : ""}{PHASE_LABEL[p]}</span>
        ))}
      </div>

      {phase === "partition" && <PartitionManager required={spec.requiredPartitions} os={spec.os} onDone={next} />}
      {phase === "applying" && <Applying host={host} faulty={assemblyFaulty} fault={assemblyFault} onFault={onFault} onDone={next} />}
      {phase === "network" && <NetworkConfig net={net} onDone={next} />}
      {phase === "unjoin" && <Unjoin host={host} onDone={next} />}
      {phase === "domain" && <DomainJoin mode={spec.mode} onDone={next} />}
    </div>
  );
}

const PHASE_LABEL: Record<Phase, string> = { partition: "Partition", applying: "Image", network: "TCP/IP", unjoin: "Unjoin", domain: "Domain", done: "Done" };

// ── Manual partitioning ──────────────────────────────────────────────────────

function PartitionManager({ required, os, onDone }: { required: PartitionKind[]; os: "windows" | "linux"; onDone: () => void }) {
  const [created, setCreated] = useState<PartitionKind[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const nextNeeded = required[created.length];
  const complete = created.length === required.length;

  function add(kind: PartitionKind) {
    if (kind !== nextNeeded) {
      setErr(`Wrong order — ${os === "windows" ? "Windows" : "Linux"} needs ${required.map((r) => r).join(" → ")}. Create ${nextNeeded} next.`);
      setTimeout(() => setErr(null), 2200);
      return;
    }
    setCreated((c) => [...c, kind]);
    setErr(null);
  }

  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="mb-1 text-sm font-semibold text-gray-100">Disk Management — Disk 0 (unallocated)</div>
      <div className="mb-3 text-[11px] text-gray-500">Create the required partitions in order: {required.join(" → ")}</div>

      {/* disk bar */}
      <div className="mb-3 flex h-9 w-full overflow-hidden rounded border border-edge bg-black/40 text-[9px] font-semibold text-black">
        {created.map((k) => (
          <div key={k} className={`flex items-center justify-center ${PART_META[k].color}`} style={{ width: k === "WINDOWS" || k === "LINUX" ? "60%" : k === "EFI" ? "14%" : "8%" }}>{k}</div>
        ))}
        {!complete && <div className="flex flex-1 items-center justify-center text-gray-500">unallocated</div>}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["EFI", "MSR", os === "windows" ? "WINDOWS" : "LINUX"] as PartitionKind[]).filter((k) => required.includes(k)).map((k) => (
          <button key={k} onClick={() => add(k)} disabled={created.includes(k)} className="rounded border border-edge px-2 py-1 text-[11px] text-gray-200 hover:border-info/50 hover:bg-info/5 disabled:opacity-40">
            + {PART_META[k].label} <span className="text-gray-500">({PART_META[k].size})</span>
          </button>
        ))}
      </div>

      {err && <div className="mb-2 text-[11px] text-danger">{err}</div>}
      <button onClick={onDone} disabled={!complete} className="rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110 disabled:bg-edge disabled:text-gray-500">Apply layout &amp; image →</button>
    </div>
  );
}

// ── Image application (fault trip) ───────────────────────────────────────────

function Applying({ host, faulty, fault, onFault, onDone }: { host: string; faulty: boolean; fault?: string; onFault: () => void; onDone: () => void }) {
  const [prog, setProg] = useState(0);
  const [failed, setFailed] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setProg((p) => Math.min(100, p + 5)), 80);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (prog >= 100 && !fired.current) { fired.current = true; if (faulty) setFailed(true); else onDone(); }
    // eslint-disable-next-line
  }, [prog]);

  if (failed) {
    return (
      <div className="rounded-lg border border-danger/50 bg-danger/10 p-5 text-center">
        <div className="text-3xl">⚠️</div>
        <div className="mt-1 font-semibold text-danger">Hardware Interrupt / Power Error</div>
        <div className="mt-1 text-[11px] text-gray-400">Imaging aborted at POST — {fault ?? "assembly incomplete"}. Fix the bench unit and re-image.</div>
        <button onClick={onFault} className="mt-3 rounded-md border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/15">← Back to Assembly</button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-edge bg-black p-5 font-mono text-[12px] text-emerald-400">
      <div className="mb-2 text-emerald-500">Applying image to {host}…</div>
      <div className="mb-2 h-3 w-full overflow-hidden rounded bg-emerald-950"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${prog}%` }} /></div>
      <div className="text-[11px] text-emerald-300/80">{prog}% — copying WIM · expanding files · applying drivers</div>
    </div>
  );
}

// ── Manual TCP/IP ────────────────────────────────────────────────────────────

function NetworkConfig({ net, onDone }: { net: NetExpectation; onDone: () => void }) {
  const [ip, setIp] = useState("");
  const [mask, setMask] = useState("");
  const [gw, setGw] = useState("");
  const [err, setErr] = useState(false);
  function apply() {
    if (ip.trim() === net.ip && mask.trim() === net.mask && gw.trim() === net.gateway) onDone();
    else setErr(true);
  }
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="mb-1 text-sm font-semibold text-gray-100">Internet Protocol Version 4 (TCP/IPv4) Properties</div>
      <div className="mb-3 text-[11px] text-gray-500">Use the static addressing from the deployment work order.</div>
      <div className="mb-3 rounded border border-info/30 bg-info/5 p-2 text-[11px] text-info">
        📋 Work order — IP {net.ip} · Mask {net.mask} · Gateway {net.gateway}
      </div>
      <div className="space-y-2">
        <Field label="IP address" value={ip} onChange={(v) => { setIp(v); setErr(false); }} />
        <Field label="Subnet mask" value={mask} onChange={(v) => { setMask(v); setErr(false); }} />
        <Field label="Default gateway" value={gw} onChange={(v) => { setGw(v); setErr(false); }} />
      </div>
      {err && <div className="mt-2 text-[11px] text-danger">Addressing doesn&apos;t match the node schema — the machine can&apos;t reach the domain.</div>}
      <button onClick={apply} className="mt-3 rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110">Apply network →</button>
    </div>
  );
}

// ── Domain trust / join ──────────────────────────────────────────────────────

function Unjoin({ host, onDone }: { host: string; onDone: () => void }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="text-sm font-semibold text-amber-200">Trust relationship broken</div>
      <div className="mt-1 text-[11px] text-gray-400">The secure channel between {host} and the domain has failed (machine password out of sync). Remove the stale computer account, then rejoin.</div>
      <button onClick={onDone} className="mt-3 rounded-md border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10">Remove from domain (unjoin) →</button>
    </div>
  );
}

function DomainJoin({ mode, onDone }: { mode: "install" | "repair"; onDone: () => void }) {
  const [domain, setDomain] = useState("");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  function join() {
    if (domain.trim().toLowerCase() !== LAB_DOMAIN) { setErr(`Domain not found. Enter the AD domain (${LAB_DOMAIN}).`); return; }
    if (user.trim().toLowerCase() !== LAB_ADMIN.user || pw !== LAB_ADMIN.password) { setErr("Access denied — a domain admin credential is required to join."); return; }
    onDone();
  }
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="mb-1 text-sm font-semibold text-gray-100">{mode === "repair" ? "Rejoin Active Directory Domain" : "Join Active Directory Domain"}</div>
      <div className="mb-3 text-[11px] text-gray-500">Provide the domain and a high-privilege account authorized to join computers.</div>
      <div className="mb-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-300">
        🔐 Deployment vault — {LAB_ADMIN.user}@{LAB_DOMAIN} · pwd: <span className="font-mono">{LAB_ADMIN.password}</span>
      </div>
      <div className="space-y-2">
        <Field label="Domain" value={domain} onChange={(v) => { setDomain(v); setErr(null); }} placeholder={LAB_DOMAIN} />
        <Field label="Admin username" value={user} onChange={(v) => { setUser(v); setErr(null); }} />
        <Field label="Password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} password />
      </div>
      {err && <div className="mt-2 text-[11px] text-danger">{err}</div>}
      <button onClick={join} className="mt-3 rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110">{mode === "repair" ? "Rejoin domain" : "Join domain"} →</button>
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, password }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; password?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-[11px] text-gray-400">{label}</span>
      <input type={password ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 rounded border border-edge bg-panelalt px-2 py-1 font-mono text-[12px] text-gray-100 outline-none placeholder:text-gray-600 focus:border-info" />
    </div>
  );
}
