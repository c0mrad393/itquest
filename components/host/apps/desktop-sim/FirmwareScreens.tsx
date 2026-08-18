"use client";

/**
 * Firmware surfaces — POST halt, BIOS/UEFI setup, and the OS handoff
 * ==================================================================
 * The three screens between a closed chassis and a running operating system.
 *
 * ── EVERYTHING SHOWN IS READ OFF THE HARDWARE ───────────────────────────────
 *
 * The detected CPU, memory total and disk list come from `rigSpec` and the slot
 * table, not from a config object. Pull a stick on the bench and the BIOS shows
 * less memory; that is the entire point of building the physical model first,
 * and it is what makes "the BIOS only sees 8GB" a diagnosable ticket rather
 * than a scripted line of text.
 *
 * ── THE BOOT ORDER IS THE ORDER ─────────────────────────────────────────────
 *
 * No priority numbers. The list order IS the setting, and `resolveBoot` takes
 * the first BOOTABLE entry — so a disk sitting at the top with no OS on it
 * falls through to the USB installer, which is exactly the real "it keeps
 * booting to setup" complaint and its real fix.
 *
 * Pinned `theme-dark`: firmware is not themed by the operator's desktop.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useEffect, useState } from "react";
import { useDesktopSimStore } from "@/lib/desktop-sim/store";
import { AppIcon } from "@/components/ui/app-icons";

/** POST halted. The screen a technician actually meets, beep code and all. */
export function PostHaltScreen() {
  const halt = useDesktopSimStore((s) => s.halt);
  const powerOff = useDesktopSimStore((s) => s.powerOff);
  const enterBios = useDesktopSimStore((s) => s.enterBios);
  if (!halt) return null;

  return (
    <div className="theme-dark flex h-full flex-col items-center justify-center bg-[#05070c] p-8 font-mono text-[12px] text-slate-300">
      <div className="w-full max-w-lg">
        <div className="text-[13px] text-slate-100">Macrohard UEFI — Power-On Self Test</div>
        <div className="mt-4 border-l-2 border-red-500 pl-3">
          <div className="text-red-400">{halt.screen}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            POST code {halt.code} · beep pattern: {halt.beeps}
          </div>
        </div>
        <p className="mt-4 max-w-md text-[11px] leading-relaxed text-slate-500">
          The system stopped before handing off to an operating system. Correct the fault on the
          bench and power on again — there is nothing to acknowledge or clear.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={powerOff}
            className="rounded border border-slate-600 px-3 py-1.5 text-[11px] text-slate-200 transition-colors hover:bg-slate-100/10"
          >
            Power off
          </button>
          <button
            onClick={enterBios}
            className="rounded border border-slate-600 px-3 py-1.5 text-[11px] text-slate-200 transition-colors hover:bg-slate-100/10"
          >
            F1 — Run SETUP
          </button>
        </div>
      </div>
    </div>
  );
}

/** BIOS / UEFI setup. */
export function BiosSetupScreen() {
  const build = useDesktopSimStore((s) => s.build);
  const bios = useDesktopSimStore((s) => s.bios);
  const spec = useDesktopSimStore((s) => s.spec)();
  const sensors = useDesktopSimStore((s) => s.sensors)();

  const moveBoot = useDesktopSimStore((s) => s.moveBoot);
  const setFlag = useDesktopSimStore((s) => s.setBiosFlag);
  const save = useDesktopSimStore((s) => s.saveAndReboot);
  const powerOff = useDesktopSimStore((s) => s.powerOff);
  const [now] = useState(() => new Date());

  // The two DIMM slots the desktop has, read off the build rather than a slot
  // table — there is no slot table any more, and there does not need to be.
  const dimms = [
    { id: "ram1" as const, label: "DIMM A1" },
    { id: "ram2" as const, label: "DIMM A2" },
  ];

  return (
    <div className="theme-dark flex h-full flex-col bg-[#00126b] font-mono text-[12px] text-slate-100">
      <header className="border-b border-slate-400/40 px-4 py-2 text-center text-[13px] font-semibold tracking-wide">
        Macrohard UEFI Setup Utility — ATX desktop
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto term-scroll p-4 md:grid-cols-2">
        <section>
          <h3 className="mb-1.5 border-b border-slate-400/30 pb-1 text-[11px] uppercase tracking-wider text-slate-300">
            System information
          </h3>
          <Line k="System time" v={now.toLocaleTimeString("en-GB", { hour12: false })} />
          <Line k="System date" v={now.toLocaleDateString("en-GB")} />
          <Line k="Processor" v={spec.cpuModel} />
          <Line k="Logical cores" v={String(spec.cores)} />
          <Line k="Total memory" v={spec.ramGb ? `${spec.ramGb} GB` : "not detected"} />
          <Line k="Storage" v={spec.diskGb ? `${spec.diskGb} GB` : "none"} />
        </section>

        <section>
          <h3 className="mb-1.5 border-b border-slate-400/30 pb-1 text-[11px] uppercase tracking-wider text-slate-300">
            Memory slots
          </h3>
          {dimms.map((d) => (
            <Line
              key={d.id}
              k={d.label}
              v={build.installed.includes(d.id) ? "8GB DDR4-3200" : "empty"}
            />
          ))}
        </section>

        <section>
          <h3 className="mb-1.5 border-b border-slate-400/30 pb-1 text-[11px] uppercase tracking-wider text-slate-300">
            Boot order
          </h3>
          <p className="mb-2 text-[10px] leading-relaxed text-slate-400">
            The first entry that is bootable wins. An empty disk is skipped.
          </p>
          {bios.bootOrder.map((d, i) => (
            <div
              key={d.id}
              className="mb-1 flex items-center gap-2 border border-slate-400/25 px-2 py-1"
            >
              <span className="w-4 shrink-0 text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className={`shrink-0 text-[10px] ${d.bootable ? "text-emerald-400" : "text-slate-500"}`}>
                {d.bootable ? "bootable" : "no media"}
              </span>
              <button
                onClick={() => moveBoot(d.id, "up")}
                disabled={i === 0}
                aria-label={`Move ${d.label} up`}
                className="shrink-0 px-1 text-slate-300 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => moveBoot(d.id, "down")}
                disabled={i === bios.bootOrder.length - 1}
                aria-label={`Move ${d.label} down`}
                className="shrink-0 px-1 text-slate-300 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          ))}
        </section>

        <section>
          <h3 className="mb-1.5 border-b border-slate-400/30 pb-1 text-[11px] uppercase tracking-wider text-slate-300">
            H/W monitor
          </h3>
          <Line
            k="CPU temperature"
            v={`${sensors.cpuTempC} °C`}
            tone={sensors.cpuTempCritical ? "bad" : undefined}
          />
          <Line
            k="CPU fan"
            v={sensors.cpuFanRpm ? `${sensors.cpuFanRpm} RPM` : "not spinning"}
            tone={sensors.cpuFanStalled ? "bad" : undefined}
          />
          <Line k="Memory frequency" v={sensors.memoryMhz ? `${sensors.memoryMhz} MHz` : "no modules"} />
          <Line k="VCore" v={`${sensors.vcore.toFixed(3)} V`} />
          {sensors.cpuTempCritical && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-red-400">
              Thermal warning: check that the cooler is mounted, screwed down and its fan header is
              plugged in.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 border-b border-slate-400/30 pb-1 text-[11px] uppercase tracking-wider text-slate-300">
            Advanced
          </h3>
          <label className="mb-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={bios.virtualization}
              onChange={(e) => setFlag("virtualization", e.target.checked)}
            />
            Intel VT-x / AMD-V
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bios.secureBoot}
              onChange={(e) => setFlag("secureBoot", e.target.checked)}
            />
            Secure Boot
          </label>
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t border-slate-400/40 px-4 py-2">
        <span className="text-[10px] text-slate-400">F10 — save and exit · ESC — discard</span>
        <button
          onClick={powerOff}
          className="ml-auto rounded border border-slate-400/40 px-3 py-1 text-[11px] transition-colors hover:bg-slate-100/10"
        >
          Power off
        </button>
        <button
          onClick={save}
          className="rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-[11px] transition-colors hover:bg-emerald-500/30"
        >
          Save &amp; reboot
        </button>
      </footer>
    </div>
  );
}

function Line({ k, v, tone }: { k: string; v: string; tone?: "bad" }) {
  return (
    <div className="flex gap-3 py-[2px]">
      <span className="w-32 shrink-0 text-slate-400">{k}</span>
      <span className={tone === "bad" ? "text-red-400" : "text-slate-100"}>{v}</span>
    </div>
  );
}

/**
 * OS setup, booted from the USB.
 *
 * Deliberately short. The install itself is not the exercise — the exercise was
 * getting the hardware to a state that could boot one — and a ten-step wizard
 * here would bury that. What it DOES do is commit the machine to the estate, so
 * the operator can carry on in the OS layer.
 */
export function OsInstallScreen({ onCommit }: { onCommit: (spec: { ramGb: number; diskGb: number; cpuModel: string }) => void }) {
  const spec = useDesktopSimStore((s) => s.spec)();
  const complete = useDesktopSimStore((s) => s.completeInstall);
  const [step, setStep] = useState(0);

  const STEPS = [
    "Loading setup files…",
    `Detected ${spec.cpuModel}, ${spec.ramGb} GB memory`,
    `Partitioning ${spec.diskGb} GB volume…`,
    "Copying system image…",
    "Applying device drivers…",
  ];

  useEffect(() => {
    if (step >= STEPS.length) return;
    const t = setTimeout(() => setStep((n) => n + 1), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const done = step >= STEPS.length;

  return (
    <div className="theme-dark flex h-full flex-col items-center justify-center bg-[#0b1a3a] p-8 text-slate-100">
      <div className="w-full max-w-md">
        <h2 className="text-[15px] font-semibold">DeskOS Setup</h2>
        <p className="mt-1 text-[11px] text-slate-400">
          Installing to the volume detected on this machine.
        </p>
        <div className="mt-4 space-y-1 font-mono text-[11px]">
          {STEPS.slice(0, step + 1).map((line, i) => (
            <div key={line} className={i < step ? "text-slate-400" : "text-slate-100"}>
              {i < step ? "✓ " : "› "}
              {line}
            </div>
          ))}
        </div>
        {done && (
          <div className="mt-5">
            <p className="text-[11px] leading-relaxed text-emerald-300">
              Installation complete. The machine will be registered in the estate and can be
              configured from the OS layer.
            </p>
            <button
              onClick={() => {
                onCommit(spec);
                complete();
              }}
              className="mt-3 rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 text-[11px] transition-colors hover:bg-emerald-500/30"
            >
              Finish and register machine
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The machine is up. The handoff point to the OS layer. */
export function RunningScreen({ hostname }: { hostname: string | null }) {
  const spec = useDesktopSimStore((s) => s.spec)();
  const powerOff = useDesktopSimStore((s) => s.powerOff);
  return (
    <div className="theme-dark flex h-full flex-col items-center justify-center bg-[#070c14] p-8 text-slate-100">
      <div className="w-full max-w-md text-center">
        <div className="text-[14px] font-semibold text-emerald-300">Machine is running</div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          {hostname ? (
            <>
              Registered in the estate as <span className="font-mono text-slate-200">{hostname}</span> with{" "}
              {spec.ramGb} GB memory and {spec.diskGb} GB storage. Connect to it from Remote Desktop
              Connection to finish OS configuration and domain join.
            </>
          ) : (
            <>
              Booted from the installed volume. Nothing was registered — this boot did not run setup.
            </>
          )}
        </p>
        <button
          onClick={powerOff}
          className="mt-4 rounded border border-slate-600 px-3 py-1.5 text-[11px] text-slate-200 transition-colors hover:bg-slate-100/10"
        >
          Power off
        </button>
      </div>
    </div>
  );
}


/**
 * The corporate desktop, freshly imaged and not yet finished.
 *
 * Two jobs remain and they are ORDERED by the model, not by this screen: the
 * network driver has to go on before a domain join can reach a controller. A
 * learner who tries the join first gets the real error — which is about the
 * NIC, not about their password — and that is the whole point of doing it in
 * this sequence.
 */
export function ProvisioningScreen({
  onJoined,
}: {
  onJoined: (domain: string) => void;
}) {
  const drivers = useDesktopSimStore((s) => s.drivers)();
  const installDriver = useDesktopSimStore((s) => s.installDriver);
  const joinDomain = useDesktopSimStore((s) => s.joinDomain);
  const joinBlocker = useDesktopSimStore((s) => s.joinBlocker)();
  const joined = useDesktopSimStore((s) => s.joinedDomain);
  const finish = useDesktopSimStore((s) => s.finishProvisioning);

  const [pane, setPane] = useState<"devices" | "domain">("devices");
  const [domain, setDomain] = useState("corp.internal");
  const [user, setUser] = useState("CORP\\Administrator");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="theme-dark flex h-full flex-col bg-[#0d1b2e] text-slate-100">
      {/* Desktop wallpaper + window */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-md border border-slate-600/50 bg-[#161b22] shadow-2xl">
          <header className="flex items-center gap-2 border-b border-slate-700 bg-[#1f252e] px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-100">
              {pane === "devices" ? "Device Manager" : "System Properties — Computer Name"}
            </span>
            <div className="ml-auto flex gap-1">
              {(["devices", "domain"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPane(p)}
                  className={`rounded px-2 py-1 text-[10px] transition-colors ${
                    pane === p ? "bg-sky-500/25 text-slate-50" : "text-slate-400 hover:bg-slate-100/10"
                  }`}
                >
                  {p === "devices" ? "Devices" : "Domain"}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto term-scroll p-3">
            {pane === "devices" ? (
              drivers.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-emerald-300">
                  All devices are working properly. No unknown devices remain.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-[11px] text-slate-400">
                    {drivers.length} device{drivers.length === 1 ? "" : "s"} need a driver.
                  </p>
                  {drivers.map((d) => (
                    <div
                      key={d.id}
                      className="mb-1.5 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2"
                    >
                      <span className="text-amber-400">
                        <AppIcon id="alert" size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-slate-100">{d.device}</span>
                        <span className="block text-[10px] text-slate-400">{d.hint}</span>
                      </span>
                      <button
                        onClick={() => installDriver(d.id)}
                        className="shrink-0 rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-200 transition-colors hover:bg-slate-100/10"
                      >
                        Install driver
                      </button>
                    </div>
                  ))}
                </>
              )
            ) : joined ? (
              <div className="text-[11px] leading-relaxed">
                <p className="text-emerald-300">
                  Welcome to the <span className="font-mono">{joined}</span> domain.
                </p>
                <p className="mt-1.5 text-slate-400">
                  A restart is required for the change to take effect. The machine will be handed
                  over registered to the estate.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-0.5 block text-[10px] text-slate-400">Domain</span>
                  <input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value.trim())}
                    className="w-full rounded border border-slate-600 bg-[#0d1117] px-2 py-1 font-mono text-[11px] text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[10px] text-slate-400">Domain administrator</span>
                  <input
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="w-full rounded border border-slate-600 bg-[#0d1117] px-2 py-1 font-mono text-[11px] text-slate-100"
                  />
                </label>
                <button
                  onClick={() => {
                    if (!joinDomain(domain)) {
                      // The refusal comes from the model, so the message names
                      // the real cause instead of blaming the credentials.
                      setError(joinBlocker);
                      return;
                    }
                    setError(null);
                    onJoined(domain);
                  }}
                  className="w-full rounded border border-emerald-400/60 bg-emerald-500/20 px-2 py-1.5 text-[11px] transition-colors hover:bg-emerald-500/30"
                >
                  Join domain
                </button>
                {error && (
                  <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[10px] leading-relaxed text-red-300">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="flex items-center gap-2 border-t border-slate-700 bg-[#1f252e] px-3 py-2">
            <span className="text-[10px] text-slate-500">
              {drivers.length === 0 && joined
                ? "Provisioning complete."
                : `${drivers.length} driver${drivers.length === 1 ? "" : "s"} outstanding · ${joined ? "domain joined" : "workgroup"}`}
            </span>
            <button
              onClick={finish}
              disabled={drivers.length > 0 || !joined}
              className="ml-auto rounded border border-slate-600 px-3 py-1 text-[10px] text-slate-200 transition-colors hover:bg-slate-100/10 disabled:opacity-40"
            >
              Hand over machine
            </button>
          </footer>
        </div>
      </div>

      {/* Taskbar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-700/70 bg-[#0f141c] px-3 py-1.5">
        <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[1.5px]">
          <span className="rounded-[1px] bg-sky-400" />
          <span className="rounded-[1px] bg-sky-400/75" />
          <span className="rounded-[1px] bg-sky-400/75" />
          <span className="rounded-[1px] bg-sky-400" />
        </span>
        <span className="text-[10px] text-slate-400">Corporate desktop</span>
        <span className="ml-auto font-mono text-[10px] text-slate-500">
          {joined ?? "WORKGROUP"}
        </span>
      </div>
    </div>
  );
}
