"use client";

/**
 * ITQuest — DevTools: Shell bench
 * ===============================
 * The controls that act on the SHELL rather than on the simulation: boot,
 * sign-in, windows, storage, notifications.
 *
 * Its own tab because the existing benches all manipulate the WORLD — level,
 * tickets, faults, network — and are things a designer uses to reach a game
 * state. These are things an engineer uses to reach a UI state, and mixing
 * "spawn a ransomware incident" with "clear local storage" in one list makes
 * the destructive one easy to hit by accident.
 *
 * Anything irreversible confirms twice. A single click that wipes a save in a
 * panel people keep open while working is a trap, however well labelled.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useState } from "react";
import { useHostStore } from "@/lib/host/store";
import { useAuthStore } from "@/lib/host/auth";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { useTutorialStore } from "@/lib/tutorial/store";
import { useDesktopIconStore } from "@/lib/host/desktop-icons";
import { HOST_APP_REGISTRY, type HostAppId } from "@/lib/core";
import { isAppUnlocked } from "@/lib/progression/unlocks";
import { useOperatorLevel } from "@/lib/progression/use-standing";

const BOOT_KEY = "itquest-booted";

export default function ShellBench({ say }: { say: (s: string) => void }) {
  const windows = useHostStore((s) => s.windows);
  const close = useHostStore((s) => s.close);
  const openApp = useHostStore((s) => s.openApp);
  const level = useOperatorLevel();
  const push = useNotificationStore((s) => s.push);

  const bypass = useAuthStore((s) => s.bypass);
  const setBypass = useAuthStore((s) => s.setBypass);
  const signOut = useAuthStore((s) => s.signOut);

  const resetTutorials = useTutorialStore((s) => s.resetTutorials);
  const resetIcons = useDesktopIconStore((s) => s.reset);
  const [armed, setArmed] = useState<string | null>(null);

  function closeAll() {
    const n = windows.length;
    // Snapshot the ids first: `close` mutates the array being iterated.
    windows.map((w) => w.instanceId).forEach(close);
    say(`Closed ${n} window${n === 1 ? "" : "s"}`);
  }

  function openEverything() {
    const ids = (Object.keys(HOST_APP_REGISTRY) as HostAppId[]).filter((id) =>
      isAppUnlocked(id, level),
    );
    ids.forEach(openApp);
    say(`Opened ${ids.length} unlocked apps — checking layout at this size`);
  }

  function replayBoot() {
    try {
      sessionStorage.removeItem(BOOT_KEY);
    } catch {
      /* noop */
    }
    say("Boot will replay on next load");
  }

  /*
   * One of each kind the store actually declares — success, info, warning.
   * There is no "error" kind, and adding one here to make the bench look
   * complete would mean the bench could produce a notification the real app
   * never can, which is the opposite of what a test bench is for.
   */
  function spawnNotifications() {
    push({ kind: "info", title: "Test notification", body: "Informational cue from DevTools.", badge: "Info" });
    push({ kind: "success", title: "Task complete", body: "A success cue, for checking the accent ink.", badge: "Done" });
    push({ kind: "warning", title: "Approaching SLA", body: "A warning cue, for checking amber on this surface.", badge: "Warn" });
    say("Spawned one notification of each kind");
  }

  /** Two-step: arm, then confirm. Reverts if the second click never comes. */
  function danger(id: string, label: string, run: () => void) {
    if (armed !== id) {
      setArmed(id);
      say(`${label} — click again to confirm`);
      window.setTimeout(() => setArmed((a) => (a === id ? null : a)), 4000);
      return;
    }
    setArmed(null);
    run();
  }

  function clearShellState() {
    // Deliberately NOT `localStorage.clear()`: this origin also holds the SAVE,
    // and wiping an estate someone is mid-way through is not what "reset the
    // UI" should mean. Only shell preferences go.
    for (const k of [
      "itquest-skin",
      "itquest-desktop-icons",
      "triageos-theme",
      "triageos-tutorial",
    ]) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    }
    try {
      sessionStorage.removeItem(BOOT_KEY);
      sessionStorage.removeItem("itquest-signed-in");
    } catch {
      /* noop */
    }
    resetTutorials();
    resetIcons();
    say("Shell preferences cleared — the save was NOT touched");
  }

  function wipeEverything() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    say("All storage cleared — reloading");
    window.setTimeout(() => window.location.assign("/"), 400);
  }

  return (
    <div className="flex flex-col gap-3">
      <Group label="Boot and sign-in">
        <Toggle
          checked={bypass}
          onChange={(v) => {
            setBypass(v);
            say(v ? "Boot and sign-in will be skipped" : "Boot and sign-in restored");
          }}
          label="Skip boot and sign-in"
          hint="Persists across reloads. Turns the whole entry sequence off while you work."
        />
        <Row>
          <Btn onClick={replayBoot}>Replay boot next load</Btn>
          <Btn
            onClick={() => {
              signOut();
              say("Signed out — the login screen returns on next load");
            }}
          >
            Sign out
          </Btn>
        </Row>
      </Group>

      <Group label="Windows">
        <Row>
          <Btn onClick={closeAll} disabled={!windows.length}>
            Close all ({windows.length})
          </Btn>
          <Btn onClick={openEverything}>Open every unlocked app</Btn>
        </Row>
        <p className="text-[10px] leading-relaxed text-gray-600">
          Opening everything at once is the fastest way to catch launch-geometry and z-order
          regressions — it is how the off-screen cascade bug was found.
        </p>
      </Group>

      <Group label="Notifications">
        <Row>
          <Btn onClick={spawnNotifications}>Spawn one of each kind</Btn>
          <Btn
            onClick={() => {
              push({
                kind: "warning",
                title: "A very long notification title that should truncate rather than reflow the tray",
                body: "And a body long enough to prove the toast wraps, clamps and stays inside its own box instead of pushing the taskbar around.",
                badge: "Overflow",
              });
              say("Spawned an overflow-test notification");
            }}
          >
            Overflow test
          </Btn>
        </Row>
      </Group>

      <Group label="State">
        <Row>
          <Btn
            onClick={() => danger("shell", "Clear shell preferences", clearShellState)}
            tone={armed === "shell" ? "warn" : undefined}
          >
            {armed === "shell" ? "Confirm: clear preferences" : "Clear shell preferences"}
          </Btn>
        </Row>
        <p className="text-[10px] leading-relaxed text-gray-600">
          Skin, wallpaper, desktop icons, theme and tutorial progress. The save is left alone.
        </p>
        <Row>
          <Btn
            onClick={() => danger("wipe", "Wipe ALL storage including the save", wipeEverything)}
            tone={armed === "wipe" ? "danger" : "danger-quiet"}
          >
            {armed === "wipe" ? "Confirm: wipe everything" : "Wipe all storage (save included)"}
          </Btn>
        </Row>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-edge bg-surface/50 p-2.5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Btn({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "warn" | "danger" | "danger-quiet";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-danger bg-danger/20 text-danger-strong"
      : tone === "danger-quiet"
        ? "border-danger/40 text-danger-strong hover:bg-danger/10"
        : tone === "warn"
          ? "border-warn bg-warn/15 text-warn-strong"
          : "border-edge text-gray-200 hover:bg-panelalt";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-[10.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

function Toggle({
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
        className="mt-0.5 accent-amber-400"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-gray-200">{label}</span>
        {hint && <span className="block text-[10px] leading-relaxed text-gray-600">{hint}</span>}
      </span>
    </label>
  );
}
