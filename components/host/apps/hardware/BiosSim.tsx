"use client";

/**
 * BiosSim — text UEFI/BIOS setup (v2)
 * ===================================
 * Entry: the slot POSTs; the player must double-click during the boot window
 * to enter Setup (miss it → "no bootable device", reboot to retry). Config:
 * Secure Boot, SATA mode (AHCI/RAID), Boot Order, and an Intel-style RAID
 * volume builder. Save & Exit only succeeds when the ticket's required states
 * are met (e.g. Secure Boot ON for Win11, RAID1 for a rebuild).
 */

import { useEffect, useState } from "react";
import type { BiosSpec } from "@/lib/hardware/types";

type Screen = "post" | "no-boot" | "setup";

export default function BiosSim({ spec, onComplete }: { spec: BiosSpec; onComplete: () => void }) {
  const [screen, setScreen] = useState<Screen>("post");
  const [secureBoot, setSecureBoot] = useState(false);
  const [sataMode, setSataMode] = useState<"AHCI" | "RAID">("AHCI");
  const [bootOrder, setBootOrder] = useState<"PXE" | "Disk">("PXE");
  const [raidCreated, setRaidCreated] = useState(false);
  const [error, setError] = useState<string[] | null>(null);

  // Boot window: if the player doesn't enter setup in time, it fails to boot.
  useEffect(() => {
    if (screen !== "post") return;
    const id = setTimeout(() => setScreen("no-boot"), 7000);
    return () => clearTimeout(id);
  }, [screen]);

  function trySaveExit() {
    const missing: string[] = [];
    if (spec.requireSecureBoot !== undefined && secureBoot !== spec.requireSecureBoot) missing.push(`Secure Boot must be ${spec.requireSecureBoot ? "Enabled" : "Disabled"}`);
    if (spec.requireSataMode && sataMode !== spec.requireSataMode) missing.push(`SATA Mode must be ${spec.requireSataMode}`);
    if (spec.requireBootOrder && bootOrder !== spec.requireBootOrder) missing.push(`First boot device must be ${spec.requireBootOrder}`);
    if (spec.requireRaid && !raidCreated) missing.push(`A ${spec.requireRaid} volume must be created`);
    if (missing.length) { setError(missing); return; }
    onComplete();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border-4 border-[#1a1f27] bg-[#05070a] p-1 shadow-2xl">
        {screen === "post" && (
          <div
            onDoubleClick={() => setScreen("setup")}
            className="min-h-[300px] cursor-pointer bg-black p-5 font-mono text-[12px] text-gray-300"
            title="Double-click to enter Setup"
          >
            <div className="text-gray-400">TriageBIOS (UEFI) v2.4 · POST</div>
            <div className="mt-3 space-y-0.5 text-gray-500">
              <div>CPU: 8-Core @ 3.4GHz &nbsp; Memory Test: OK</div>
              <div>Detecting storage devices…</div>
              <div>Initializing network stack (PXE ROM)…</div>
            </div>
            <div className="mt-6 animate-pulse text-amber-300">▶ Double-click to enter BIOS Setup…</div>
            <div className="mt-1 text-[10px] text-gray-600">(the boot window closes shortly)</div>
          </div>
        )}

        {screen === "no-boot" && (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 bg-black p-5 text-center font-mono text-[12px] text-gray-300">
            <div className="text-danger">No bootable device found.</div>
            <div className="text-gray-500">You missed the setup window. Reboot the bench unit and try again.</div>
            <button onClick={() => setScreen("post")} className="rounded border border-gray-600 px-3 py-1 text-gray-200 hover:bg-white/10">⟲ Reboot</button>
          </div>
        )}

        {screen === "setup" && (
          <div className="min-h-[300px] bg-[#0a1a4a] p-4 font-mono text-[12px] text-gray-100">
            <div className="mb-3 border-b border-white/20 pb-1 text-center text-sky-200">TriageBIOS Setup Utility — Advanced</div>
            <div className="space-y-2">
              <BiosRow label="Secure Boot" value={secureBoot ? "Enabled" : "Disabled"} onToggle={() => setSecureBoot((v) => !v)} req={spec.requireSecureBoot !== undefined} ok={spec.requireSecureBoot === undefined || secureBoot === spec.requireSecureBoot} />
              <BiosRow label="SATA Mode" value={sataMode} onToggle={() => { setSataMode((m) => (m === "AHCI" ? "RAID" : "AHCI")); setRaidCreated(false); }} req={!!spec.requireSataMode} ok={!spec.requireSataMode || sataMode === spec.requireSataMode} />
              <BiosRow label="First Boot Device" value={bootOrder === "PXE" ? "Network (PXE)" : "Local Disk"} onToggle={() => setBootOrder((b) => (b === "PXE" ? "Disk" : "PXE"))} req={!!spec.requireBootOrder} ok={!spec.requireBootOrder || bootOrder === spec.requireBootOrder} />

              {spec.requireRaid && (
                <div className="mt-2 rounded border border-white/20 bg-black/20 p-2">
                  <div className="mb-1 text-sky-200">Intel(R) RAID Configuration</div>
                  {sataMode !== "RAID" ? (
                    <div className="text-[11px] text-amber-300">Set SATA Mode to RAID to enable the array builder.</div>
                  ) : raidCreated ? (
                    <div className="text-[11px] text-emerald-300">✓ RAID Volume &quot;Array0&quot; · {spec.requireRaid} · 2 disks · Normal</div>
                  ) : (
                    <RaidBuilder onCreate={() => setRaidCreated(true)} raid={spec.requireRaid} />
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded border border-danger/50 bg-danger/10 p-2 text-[11px] text-danger">
                Cannot boot the OS installer:
                <ul className="ml-4 list-disc">{error.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3 border-t border-white/20 pt-2 text-[11px]">
              <span className="text-gray-400">↑↓ select · Enter toggle</span>
              <button onClick={trySaveExit} className="ml-auto rounded bg-sky-300 px-3 py-1 font-semibold text-black hover:brightness-110">F10 · Save &amp; Exit</button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-center text-[10px] text-gray-600">Bench monitor · firmware setup</div>
    </div>
  );
}

function BiosRow({ label, value, onToggle, req, ok }: { label: string; value: string; onToggle: () => void; req: boolean; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded px-2 py-1 hover:bg-white/10">
      <span className="w-40 text-gray-300">{label}</span>
      <button onClick={onToggle} className="rounded border border-white/30 bg-black/20 px-3 py-0.5 text-sky-100 hover:bg-black/40">◄ {value} ►</button>
      {req && <span className={`ml-auto text-[10px] ${ok ? "text-emerald-300" : "text-amber-300"}`}>{ok ? "meets requirement" : "required by ticket"}</span>}
    </div>
  );
}

function RaidBuilder({ onCreate, raid }: { onCreate: () => void; raid: string }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const disks = ["Disk 0 · 2TB SAS", "Disk 1 · 2TB SAS"];
  return (
    <div className="text-[11px]">
      <div className="mb-1 text-gray-300">Select 2 disks for the {raid} mirror:</div>
      {disks.map((d, i) => (
        <button key={d} onClick={() => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
          className={`mr-2 rounded border px-2 py-0.5 ${sel.has(i) ? "border-sky-300 bg-sky-300/20 text-sky-100" : "border-white/30 text-gray-300"}`}>
          {sel.has(i) ? "☑" : "☐"} {d}
        </button>
      ))}
      <button onClick={onCreate} disabled={sel.size !== 2} className="ml-2 rounded bg-sky-300 px-2 py-0.5 font-semibold text-black disabled:opacity-40">Create Volume</button>
    </div>
  );
}
