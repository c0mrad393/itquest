"use client";

/**
 * Remote Desktop Connection (Level-0 host app)
 * ============================================
 * An mstsc.exe-shaped client: one compact dialog, a Show Options drawer, and
 * a real connection handshake.
 *
 * ── WHAT THIS REPLACED, AND WHY ─────────────────────────────────────────────
 *
 * A grid of machine cards carrying health, CPU, memory, rack position and
 * round-trip time. All of it true, none of it this app's job — a connection
 * client answers "what am I connecting to, and can I get in". Inventory
 * belongs in Server Manager and the Monitor, which already show it with
 * history behind it; the card grid was a second, worse copy of both.
 *
 * ── THE DIALOG STAYS A DIALOG ───────────────────────────────────────────────
 *
 * Centred at a fixed max-width rather than filling the window. mstsc does not
 * stretch, and a stretched form would put a 900px gap between a field and its
 * label. The window resizes to anything; the dialog keeps its shape and the
 * room around it grows. That is also the previous squish bug's permanent
 * cure — there is no multi-column layout left to collapse.
 *
 * ── FAILURE IS A FIRST-CLASS PATH ───────────────────────────────────────────
 *
 * Connecting to a powered-down or isolated host FAILS, with the real reason
 * taken from the estate. That is the teaching value: the same client that
 * connects is the one that explains why it could not. A launcher that only
 * ever succeeds teaches nothing about the three things that normally go wrong.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { gatewayTargets } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import { AppIcon, OS_ICON_ID } from "@/components/ui/app-icons";
import {
  failureFor,
  resolveTarget,
  thumbprintFor,
  useRdpStore,
  type CertPolicy,
  type ResolvableTarget,
} from "@/lib/host/rdp";
import CopyButton from "@/components/ui/CopyButton";
import { IconChevronDown, IconHelp, IconLock, IconMonitor, IconX } from "@/components/ui/icons";

/** RDP is 3389 and always has been. Derived, never stored. */
const RDP_PORT = 3389;
type Tab = "general" | "display" | "local" | "advanced";
type Target = ResolvableTarget & { os: string; title: string };

export default function RemoteGateway() {
  const infra = useInfraStore((s) => s.infra);
  const openRemote = useHostStore((s) => s.openRemote);
  const windows = useHostStore((s) => s.windows);
  const focus = useHostStore((s) => s.focus);

  const phase = useRdpStore((s) => s.phase);
  const setPhase = useRdpStore((s) => s.setPhase);
  const recents = useRdpStore((s) => s.recents);
  const trusted = useRdpStore((s) => s.trusted);
  const settings = useRdpStore((s) => s.settings);
  const hydrate = useRdpStore((s) => s.hydrate);
  const remember = useRdpStore((s) => s.remember);
  const trust = useRdpStore((s) => s.trust);

  const [computer, setComputer] = useState("");
  const [username, setUsername] = useState("CORP\\Administrator");
  const [showOptions, setShowOptions] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  const [guideOpen, setGuideOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef<number>();

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Every host the estate offers, flattened to what this client needs. */
  const targets: Target[] = useMemo(
    () =>
      gatewayTargets(infra).map((t) => ({
        nodeId: t.nodeId,
        hostname: t.node.hostname,
        displayName: t.node.displayName,
        ip: t.node.connection.ip,
        connectable: t.connectable,
        reason: t.reason,
        os: t.node.os,
        title: t.node.displayName,
      })),
    [infra],
  );

  const busy = phase.kind === "connecting";

  function launch(t: Target, typed: string) {
    remember(typed, username);
    setPhase({ kind: "idle" });
    const existing = windows.find((w) => w.kind === "remote" && w.nodeId === t.nodeId);
    if (existing) {
      focus(existing.instanceId);
      return;
    }
    openRemote(
      t.nodeId,
      t.title,
      OS_ICON_ID[t.os as keyof typeof OS_ICON_ID] ?? "windows",
      "rdp",
    );
  }

  function beginConnect() {
    if (busy || !computer.trim()) return;
    setPickerOpen(false);
    setPhase({ kind: "connecting", computer: computer.trim(), username, startedAt: Date.now() });

    /*
     * A handshake takes a moment, and the Connecting dialog is the only place
     * the operator can cancel. 900ms is long enough to read and act on, short
     * enough not to tax someone connecting forty times a shift.
     */
    timer.current = window.setTimeout(() => {
      const typed = computer.trim();
      const target = resolveTarget(typed, targets);

      if (!target || !target.connectable) {
        setPhase({ kind: "failed", computer: typed, ...failureFor(typed, target) });
        return;
      }

      const thumbprint = thumbprintFor(target.hostname);
      const seen = trusted.includes(thumbprint);

      // Policy first: "Don't connect" refuses an unverified host before any
      // credential is sent, which is what that setting means.
      if (!seen && settings.certPolicy === "refuse") {
        setPhase({
          kind: "failed",
          computer: typed,
          reason: "Remote Desktop cannot verify the identity of the remote computer",
          detail:
            `This client is set to "Don't connect" when verification fails, so the connection to ` +
            `${target.hostname} was refused before credentials were sent. Change it under ` +
            `Show Options, Advanced — or install a certificate this machine trusts.`,
        });
        return;
      }
      if (!seen && settings.certPolicy === "warn") {
        setPhase({
          kind: "cert",
          computer: typed,
          username,
          nodeId: target.nodeId,
          thumbprint,
          issuedTo: target.hostname,
        });
        return;
      }
      launch(target, typed);
    }, 900);
  }

  function cancel() {
    window.clearTimeout(timer.current);
    setPhase({ kind: "idle" });
  }

  return (
    /*
     * ── NO OUTER CANVAS ─────────────────────────────────────────────────────
     *
     * This used to be a `bg-sunken` page with the dialog centred on it inside
     * a max-width column — a window frame wrapping a page wrapping a dialog,
     * with two borders, two backgrounds and a scrollbar that appeared before
     * the content needed one.
     *
     * The app IS the dialog now. The frame wraps it directly, the registry
     * sizes the window to it (420px), and there is exactly one border on
     * screen: the window's own.
     */
    <div className="relative flex h-full flex-col bg-panel">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto term-scroll p-4">
        <header className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-info/15 text-info-strong">
            <IconMonitor size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-semibold text-gray-100">
              Remote Desktop Connection
            </h1>
            <p className="truncate text-[11px] text-gray-500">
              {infra.clientOrg} · TCP {RDP_PORT}
            </p>
          </div>
          <button
            onClick={() => setGuideOpen(true)}
            aria-label="RDP essentials guide"
            title="RDP essentials guide"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge text-gray-400 transition hover:bg-panelalt hover:text-gray-100"
          >
            <IconHelp size={13} />
          </button>
        </header>

        <div
          data-tutorial-target="gateway-targets"
          className="rounded-wm border border-edge bg-surface-2 p-3.5"
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-gray-400">Computer:</span>
            <div className="relative">
              <input
                value={computer}
                onChange={(e) => {
                  setComputer(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") beginConnect();
                  if (e.key === "Escape") setPickerOpen(false);
                }}
                placeholder="Example: 10.64.3.20 or DC-01"
                spellCheck={false}
                className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 pr-8 font-mono text-[12px] text-gray-100 outline-none transition placeholder:font-sans placeholder:text-gray-600 focus:border-brand-text focus:ring-2 focus:ring-brand-text/25"
              />
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                aria-label="Recent and known computers"
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-gray-500 transition hover:bg-gray-500/15 hover:text-gray-200"
              >
                <IconChevronDown size={12} />
              </button>

              {pickerOpen && (
                <ComputerPicker
                  recents={recents}
                  targets={targets}
                  query={computer}
                  onPick={(v) => {
                    setComputer(v);
                    setPickerOpen(false);
                  }}
                  onDismiss={() => setPickerOpen(false)}
                />
              )}
            </div>
          </label>

          <label className="mt-2.5 block">
            <span className="mb-1 block text-[11px] font-medium text-gray-400">User name:</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && beginConnect()}
              spellCheck={false}
              className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-gray-100 outline-none transition focus:border-brand-text focus:ring-2 focus:ring-brand-text/25"
            />
          </label>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-gray-600">
            You will be asked for credentials when you connect. Domain accounts use{" "}
            <span className="font-mono text-gray-500">DOMAIN\Administrator</span>; local accounts
            use <span className="font-mono text-gray-500">.\Administrator</span>.
          </p>

          {showOptions && <OptionsDrawer tab={tab} setTab={setTab} computer={computer} username={username} />}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
            <button
              onClick={() => setShowOptions((o) => !o)}
              className="rounded-md border border-edge px-2.5 py-1.5 text-[11.5px] text-gray-300 transition hover:bg-panelalt"
            >
              {showOptions ? "Hide Options" : "Show Options"}
            </button>
            <button
              onClick={() => setGuideOpen(true)}
              className="rounded-md border border-edge px-2.5 py-1.5 text-[11.5px] text-gray-300 transition hover:bg-panelalt"
            >
              Help
            </button>
            <button
              onClick={beginConnect}
              disabled={busy || !computer.trim()}
              className="ml-auto rounded-md bg-brand-fill px-4 py-1.5 text-[12px] font-semibold text-brand-on transition hover:bg-brand-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      </div>

      {phase.kind === "connecting" && <ConnectingModal computer={phase.computer} onCancel={cancel} />}
      {phase.kind === "cert" && (
        <CertModal
          issuedTo={phase.issuedTo}
          thumbprint={phase.thumbprint}
          onYes={() => {
            trust(phase.thumbprint);
            const t = targets.find((x) => x.nodeId === phase.nodeId);
            if (t) launch(t, phase.computer);
            else cancel();
          }}
          onNo={cancel}
        />
      )}
      {phase.kind === "failed" && (
        <FailureModal
          reason={phase.reason}
          detail={phase.detail}
          onClose={cancel}
          onHelp={() => {
            cancel();
            setGuideOpen(true);
          }}
        />
      )}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

/* ── Computer picker ─────────────────────────────────────────────────────── */

function ComputerPicker({
  recents,
  targets,
  query,
  onPick,
  onDismiss,
}: {
  recents: { computer: string; username: string }[];
  targets: Target[];
  query: string;
  onPick: (v: string) => void;
  onDismiss: () => void;
}) {
  const q = query.trim().toLowerCase();
  const matches = targets.filter(
    (t) =>
      !q ||
      t.hostname.toLowerCase().includes(q) ||
      t.ip.includes(q) ||
      t.displayName.toLowerCase().includes(q),
  );

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-rdp-picker]")) onDismiss();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onDismiss]);

  return (
    <div
      data-rdp-picker
      className="ctx-in absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-64 overflow-y-auto term-scroll rounded-md border border-edge bg-surface shadow-panel"
    >
      {recents.length > 0 && !q && (
        <>
          <PickerHead>Recent</PickerHead>
          {recents.map((r) => (
            <button
              key={r.computer}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r.computer)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-brand-soft/15"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-gray-200">
                {r.computer}
              </span>
              <span className="shrink-0 truncate font-mono text-[10px] text-gray-600">{r.username}</span>
            </button>
          ))}
        </>
      )}
      <PickerHead>{q ? "Matching this network" : "On this network"}</PickerHead>
      {matches.length === 0 && (
        <p className="px-3 py-2 text-[11px] leading-relaxed text-gray-500">
          Nothing matches. A name that is not here will fail to resolve — which is itself a useful
          result when you are chasing a DNS ticket.
        </p>
      )}
      {matches.map((t) => (
        <button
          key={t.nodeId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(t.hostname)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-brand-soft/15"
        >
          <AppIcon id={OS_ICON_ID[t.os as keyof typeof OS_ICON_ID] ?? "windows"} size={13} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[11.5px] text-gray-200">{t.hostname}</span>
            <span className="block truncate font-mono text-[10px] text-gray-600">{t.ip}</span>
          </span>
          {/* Unreachable hosts stay LISTED and greyed. Hiding them makes a
              powered-down machine look like one that never existed, and "it is
              not in the list" is the wrong diagnosis to teach. */}
          {!t.connectable && (
            <span className="shrink-0 rounded bg-gray-500/15 px-1.5 py-0.5 text-[9px] text-gray-500">
              offline
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PickerHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-edge bg-surface-2 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </div>
  );
}

/* ── Options drawer ──────────────────────────────────────────────────────── */

function OptionsDrawer({
  tab,
  setTab,
  computer,
  username,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  computer: string;
  username: string;
}) {
  const settings = useRdpStore((s) => s.settings);
  const setSettings = useRdpStore((s) => s.setSettings);
  const profiles = useRdpStore((s) => s.profiles);
  const saveProfile = useRdpStore((s) => s.saveProfile);
  const deleteProfile = useRdpStore((s) => s.deleteProfile);
  const clearRecents = useRdpStore((s) => s.clearRecents);
  const [profileName, setProfileName] = useState("");

  return (
    <div className="mt-3 rounded-md border border-edge bg-surface-2">
      <div className="scroll-thin flex overflow-x-auto border-b border-edge">
        {(["general", "display", "local", "advanced"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-active={tab === t}
            className="tab shrink-0 whitespace-nowrap capitalize"
          >
            {t === "local" ? "Local Resources" : t}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === "general" && (
          <Section
            title="Connection settings"
            blurb="Save the current settings as an .rdp profile, or reopen a saved one."
          >
            <div className="flex flex-wrap gap-1.5">
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Profile name"
                className="min-w-0 flex-1 rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-brand-text"
              />
              <button
                onClick={() => {
                  if (!profileName.trim() || !computer.trim()) return;
                  saveProfile(profileName.trim(), computer.trim(), username);
                  setProfileName("");
                }}
                disabled={!profileName.trim() || !computer.trim()}
                className="rounded border border-edge px-2 py-1 text-[11px] text-gray-200 transition hover:bg-panelalt disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save As…
              </button>
            </div>
            {profiles.length > 0 ? (
              <ul className="mt-2 divide-y divide-edge/70 rounded border border-edge">
                {profiles.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-gray-200">{p.name}.rdp</span>
                      <span className="block truncate font-mono text-[10px] text-gray-600">
                        {p.computer} · {p.username}
                      </span>
                    </span>
                    <button
                      onClick={() => deleteProfile(p.id)}
                      aria-label={`Delete ${p.name}`}
                      className="shrink-0 rounded p-1 text-gray-500 transition hover:bg-danger/15 hover:text-danger-strong"
                    >
                      <IconX size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">
                No saved profiles. Saved connections live on this workstation only.
              </p>
            )}
            <button
              onClick={clearRecents}
              className="mt-2 self-start text-[10.5px] text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-gray-300"
            >
              Clear the recent connections list
            </button>
          </Section>
        )}

        {tab === "display" && (
          <Section title="Display configuration" blurb="Choose the size of your remote desktop.">
            <Radio
              name="display"
              value={settings.display}
              onChange={(v) => setSettings({ display: v as "fit" | "fullscreen" })}
              options={[
                { value: "fit", label: "Fit to window", hint: "The session resizes with its window frame." },
                { value: "fullscreen", label: "Full screen", hint: "Maximise the session window on connect." },
              ]}
            />
          </Section>
        )}

        {tab === "local" && (
          <Section
            title="Remote audio and keyboard"
            blurb="Choose how local devices are used in the remote session."
          >
            <Radio
              name="audio"
              value={settings.audio}
              onChange={(v) => setSettings({ audio: v as "local" | "remote" | "none" })}
              options={[
                { value: "local", label: "Play on this computer" },
                { value: "remote", label: "Play on remote computer" },
                { value: "none", label: "Do not play" },
              ]}
            />
            <Check
              checked={settings.keyboardToRemote}
              onChange={(v) => setSettings({ keyboardToRemote: v })}
              label="Apply Windows key combinations to the remote session"
              hint="With this off, Alt+Tab switches your own windows rather than the remote ones."
            />
            <Check
              checked={settings.clipboardSharing}
              onChange={(v) => setSettings({ clipboardSharing: v })}
              label="Share clipboard"
            />
          </Section>
        )}

        {tab === "advanced" && (
          <Section
            title="Server authentication"
            blurb="Server authentication verifies that you are connecting to the computer you intended. What happens when it fails is your choice."
          >
            <Radio
              name="cert"
              value={settings.certPolicy}
              onChange={(v) => setSettings({ certPolicy: v as CertPolicy })}
              options={[
                {
                  value: "warn",
                  label: "Warn me",
                  hint: "Show the certificate and let you decide. The default, and the one that teaches something.",
                },
                {
                  value: "refuse",
                  label: "Don't connect",
                  hint: "Refuse any host whose identity cannot be verified.",
                },
                {
                  value: "connect",
                  label: "Connect and don't warn me",
                  hint: "Never prompt. Convenient, and exactly how people end up on the wrong host.",
                },
              ]}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-semibold text-gray-200">{title}</div>
      {blurb && <p className="mb-2 mt-0.5 text-[10.5px] leading-relaxed text-gray-500">{blurb}</p>}
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Radio({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 accent-info"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] text-gray-200">{o.label}</span>
            {o.hint && <span className="block text-[10px] leading-relaxed text-gray-600">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-info"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-gray-200">{label}</span>
        {hint && <span className="block text-[10px] leading-relaxed text-gray-600">{hint}</span>}
      </span>
    </label>
  );
}

/* ── Modals ──────────────────────────────────────────────────────────────── */

function Modal({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-sunken/70 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="ctx-in w-full max-w-[26rem] overflow-hidden rounded-wm border border-edge bg-panel shadow-panel"
      >
        {children}
      </div>
    </div>
  );
}

function ConnectingModal({ computer, onCancel }: { computer: string; onCancel: () => void }) {
  return (
    <Modal labelledBy="rdp-connecting">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info/15 text-info-strong">
          <IconMonitor size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="rdp-connecting" className="text-[13px] font-semibold text-gray-100">
            Connecting to <span className="font-mono">{computer}</span>…
          </h2>
          <p className="mt-1 text-[11px] text-gray-500">
            Initiating remote connection on TCP {RDP_PORT}.
          </p>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="rdp-progress h-full w-1/3 rounded-full bg-brand-fill" />
          </div>
        </div>
      </div>
      <div className="form-footer">
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function CertModal({
  issuedTo,
  thumbprint,
  onYes,
  onNo,
}: {
  issuedTo: string;
  thumbprint: string;
  onYes: () => void;
  onNo: () => void;
}) {
  const [details, setDetails] = useState(false);
  return (
    <Modal labelledBy="rdp-cert">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warn/15 text-warn-strong">
          <IconLock size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="rdp-cert" className="text-[13px] font-semibold text-gray-100">
            The identity of the remote computer cannot be verified
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-400">
            Do you want to connect anyway? The certificate presented by{" "}
            <span className="font-mono text-gray-200">{issuedTo}</span> is self-signed, so nothing
            independent vouches for it.
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">
            On an estate you control this is routine — internal hosts rarely have public
            certificates. It becomes a real warning when the host is one you did not expect, or when
            the thumbprint has CHANGED since last time.
          </p>

          <button
            onClick={() => setDetails((d) => !d)}
            className="mt-2 text-[11px] text-brand-text transition hover:underline"
          >
            {details ? "Hide certificate" : "View certificate…"}
          </button>
          {details && (
            <dl className="mt-2 space-y-1 rounded border border-edge bg-surface-2 p-2.5 text-[10.5px]">
              <Row label="Issued to" value={issuedTo} />
              <Row label="Issued by" value={`${issuedTo} (self-signed)`} />
              <Row label="Valid" value="Today, for 365 days" />
              <Row label="Algorithm" value="SHA-256 RSA (2048 bit)" />
              <div className="flex items-start gap-1.5">
                <dt className="w-[4.5rem] shrink-0 text-gray-500">Thumbprint</dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-gray-300">
                  {thumbprint}
                  <CopyButton value={thumbprint} label="thumbprint" size={10} className="ml-1 align-middle" />
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
      <div className="form-footer">
        <span className="footer-note">Accepting is remembered for this host.</span>
        <button onClick={onNo} className="btn-secondary">
          No
        </button>
        <button onClick={onYes} className="btn-primary">
          Yes
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <dt className="w-[4.5rem] shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-300">{value}</dd>
    </div>
  );
}

function FailureModal({
  reason,
  detail,
  onClose,
  onHelp,
}: {
  reason: string;
  detail: string;
  onClose: () => void;
  onHelp: () => void;
}) {
  return (
    <Modal labelledBy="rdp-failed">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-danger/15 text-danger-strong">
          <IconX size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="rdp-failed" className="text-[13px] font-semibold text-gray-100">
            {reason}
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-400">{detail}</p>
        </div>
      </div>
      <div className="form-footer">
        <button onClick={onHelp} className="btn-secondary">
          Troubleshoot
        </button>
        <button onClick={onClose} className="btn-primary">
          OK
        </button>
      </div>
    </Modal>
  );
}

/* ── Guide ───────────────────────────────────────────────────────────────── */

const GUIDE = [
  {
    title: "Port 3389, and why it matters",
    body: "RDP listens on TCP 3389. If a connection times out rather than being refused, the usual cause is a firewall dropping that port silently — a refusal means something answered and said no, a timeout means nothing answered at all. That distinction is most of the diagnosis.",
  },
  {
    title: "DOMAIN\\user versus .\\user",
    body: "A domain account is authenticated by the domain controller and works on any joined machine. A local account exists only on that one host and is written .\\name. If credentials fail everywhere, suspect the domain; if they fail on one box, suspect the local account.",
  },
  {
    title: "Certificate warnings",
    body: "Internal hosts usually present self-signed certificates, so the warning is routine on an estate you own. What is not routine is the thumbprint changing for a host you have connected to before — that means you are talking to a different machine than last time.",
  },
  {
    title: "Network unreachable",
    body: "Ping the address first. If the name fails but the IP works, it is DNS. If neither works, check the switch port and whether the host has power — Server Manager and Network Switches both answer that faster than guessing from here.",
  },
  {
    title: "Remote Desktop disabled on the target",
    body: "A powered, reachable host that refuses 3389 usually has Remote Desktop turned off, or is not accepting the account you used. The connection is actively refused rather than timing out, which is how you tell it apart from a network fault.",
  },
  {
    title: "Invalid credentials",
    body: "A locked-out or expired account fails after the certificate stage, not before — so if you reached a password prompt at all, the network and the host are both fine and the problem is in the directory.",
  },
];

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal labelledBy="rdp-guide">
      <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-4 py-2.5">
        <IconHelp size={14} className="shrink-0 text-info-strong" />
        <h2 id="rdp-guide" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-100">
          RDP Essentials
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-500/15 hover:text-gray-100"
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="max-h-[24rem] overflow-y-auto term-scroll p-4">
        <ol className="flex flex-col gap-3">
          {GUIDE.map((g, i) => (
            <li key={g.title}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-gray-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[12px] font-semibold text-gray-100">{g.title}</h3>
              </div>
              <p className="mt-1 pl-6 text-[11px] leading-relaxed text-gray-400">{g.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="form-footer">
        <button onClick={onClose} className="btn-primary">
          Close
        </button>
      </div>
    </Modal>
  );
}
