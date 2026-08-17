"use client";

/**
 * ITQuest — RDP client state
 * ==========================
 * Recents, trusted certificates, saved profiles, and the connection lifecycle.
 *
 * ── WHY THE LIFECYCLE IS A MACHINE AND NOT A PILE OF BOOLEANS ───────────────
 *
 * A connect attempt passes through connecting, possibly a certificate prompt,
 * then either a session or a failure — and the operator can cancel at any
 * point. Modelled as `isConnecting` + `showCert` + `error` booleans, the
 * illegal combinations outnumber the legal ones: cancelling during the cert
 * prompt leaves `isConnecting` true, a failure arriving after a cancel
 * re-opens a dialog the operator dismissed. A single discriminated `phase`
 * makes those states unrepresentable rather than merely unlikely.
 *
 * ── AND WHY IT IS SEPARATE FROM THE COMPONENT ───────────────────────────────
 *
 * The brief asks for this to be ready for real socket integration. When that
 * lands, `connect` stops resolving from `gatewayTargets` and starts awaiting a
 * socket — but the phases, the trust store and the recents list do not change.
 * Keeping them out of the view means that swap touches one file.
 *
 * ── THE TRUST STORE IS REAL ─────────────────────────────────────────────────
 *
 * mstsc warns once per host and then remembers. So does this: a thumbprint the
 * operator accepted is persisted, and the warning does not reappear for that
 * host. A prompt that fires on every single connect is one people learn to
 * click through without reading, which is the exact habit this scenario exists
 * to warn against.
 */

import { create } from "zustand";

const RECENTS_KEY = "itquest-rdp-recents";
const TRUST_KEY = "itquest-rdp-trusted";
const PROFILES_KEY = "itquest-rdp-profiles";
const MAX_RECENTS = 8;

/** How the client should size the remote desktop. */
export type DisplayMode = "fit" | "fullscreen";
/** What to do when the remote host's certificate cannot be verified. */
export type CertPolicy = "warn" | "refuse" | "connect";

export interface RdpSettings {
  display: DisplayMode;
  /** Play remote audio locally, leave it on the remote host, or mute. */
  audio: "local" | "remote" | "none";
  /** Apply Windows key combinations to the remote session. */
  keyboardToRemote: boolean;
  clipboardSharing: boolean;
  certPolicy: CertPolicy;
}

export const DEFAULT_SETTINGS: RdpSettings = {
  display: "fit",
  audio: "local",
  keyboardToRemote: true,
  clipboardSharing: true,
  certPolicy: "warn",
};

export interface RdpProfile {
  id: string;
  name: string;
  computer: string;
  username: string;
  settings: RdpSettings;
}

export interface RecentConnection {
  computer: string;
  username: string;
  at: number;
}

/**
 * The connection lifecycle.
 *
 * `target` is the resolved node id once we know it — carried through so the
 * cert prompt and the session launch do not each re-resolve the hostname and
 * risk disagreeing.
 */
export type RdpPhase =
  | { kind: "idle" }
  | { kind: "connecting"; computer: string; username: string; startedAt: number }
  | {
      kind: "cert";
      computer: string;
      username: string;
      nodeId: string;
      thumbprint: string;
      issuedTo: string;
    }
  | { kind: "failed"; computer: string; reason: string; detail: string };

/**
 * A stable fake thumbprint for a host.
 *
 * Derived from the name so it is the SAME every time that host is seen —
 * a certificate whose fingerprint changed on each connect would teach the
 * opposite of what fingerprints are for.
 */
export function thumbprintFor(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex: string[] = [];
  let v = h;
  for (let i = 0; i < 10; i++) {
    hex.push(((v ^ (i * 0x9e3779b9)) >>> 0).toString(16).slice(0, 2).padStart(2, "0"));
    v = Math.imul(v ^ (i + 1), 0x01000193) >>> 0;
  }
  return hex.join(" ").toUpperCase();
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* preference not persisted; the session still honours it */
  }
}

interface RdpStore {
  phase: RdpPhase;
  recents: RecentConnection[];
  /** Thumbprints the operator has accepted. */
  trusted: string[];
  profiles: RdpProfile[];
  settings: RdpSettings;
  ready: boolean;

  hydrate: () => void;
  setSettings: (patch: Partial<RdpSettings>) => void;
  setPhase: (phase: RdpPhase) => void;
  trust: (thumbprint: string) => void;
  remember: (computer: string, username: string) => void;
  saveProfile: (name: string, computer: string, username: string) => void;
  deleteProfile: (id: string) => void;
  clearRecents: () => void;
}

export const useRdpStore = create<RdpStore>((set, get) => ({
  phase: { kind: "idle" },
  recents: [],
  trusted: [],
  profiles: [],
  settings: DEFAULT_SETTINGS,
  ready: false,

  hydrate: () =>
    set({
      recents: read<RecentConnection[]>(RECENTS_KEY, []),
      trusted: read<string[]>(TRUST_KEY, []),
      profiles: read<RdpProfile[]>(PROFILES_KEY, []),
      ready: true,
    }),

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setPhase: (phase) => set({ phase }),

  trust: (thumbprint) => {
    const trusted = Array.from(new Set([...get().trusted, thumbprint]));
    write(TRUST_KEY, trusted);
    set({ trusted });
  },

  remember: (computer, username) => {
    // Newest first, de-duplicated on the computer — reconnecting to the same
    // host should move it up the list, not add a second identical row.
    const rest = get().recents.filter((r) => r.computer.toLowerCase() !== computer.toLowerCase());
    const recents = [{ computer, username, at: Date.now() }, ...rest].slice(0, MAX_RECENTS);
    write(RECENTS_KEY, recents);
    set({ recents });
  },

  saveProfile: (name, computer, username) => {
    const profile: RdpProfile = {
      id: `rdp-${Date.now().toString(36)}`,
      name,
      computer,
      username,
      settings: get().settings,
    };
    const profiles = [...get().profiles.filter((p) => p.name !== name), profile];
    write(PROFILES_KEY, profiles);
    set({ profiles });
  },

  deleteProfile: (id) => {
    const profiles = get().profiles.filter((p) => p.id !== id);
    write(PROFILES_KEY, profiles);
    set({ profiles });
  },

  clearRecents: () => {
    write(RECENTS_KEY, []);
    set({ recents: [] });
  },
}));

// ── Pure resolution ─────────────────────────────────────────────────────────

export interface ResolvableTarget {
  nodeId: string;
  hostname: string;
  displayName: string;
  ip: string;
  connectable: boolean;
  reason?: string | null;
}

/**
 * Find the host the operator typed.
 *
 * Accepts hostname or IP, case-insensitively, because both are what an admin
 * actually types and mstsc accepts either. Pure so the spec can prove that a
 * typo resolves to nothing rather than to the wrong machine.
 */
export function resolveTarget<T extends ResolvableTarget>(
  typed: string,
  targets: T[],
): T | undefined {
  const q = typed.trim().toLowerCase();
  if (!q) return undefined;
  return targets.find(
    (t) => t.hostname.toLowerCase() === q || t.ip === q || t.displayName.toLowerCase() === q,
  );
}

/**
 * Why a connection failed, in mstsc's own voice.
 *
 * The real dialog lists the three usual causes rather than naming one, because
 * the client genuinely cannot tell them apart from the outside. This one CAN —
 * the estate knows whether the host is powered, isolated or unreachable — so
 * it names the real cause and keeps the familiar list as context. That is the
 * difference between a prop and a teaching tool.
 */
export function failureFor(
  typed: string,
  target: ResolvableTarget | undefined,
): { reason: string; detail: string } {
  if (!target) {
    return {
      reason: "Remote Desktop can't find the computer",
      detail:
        `"${typed}" does not resolve to a host on this network. Check the name for a typo, ` +
        `or use the IP address. If the name is right, DNS may be the problem — try pinging it.`,
    };
  }
  if (!target.connectable) {
    return {
      reason: "Remote Desktop can't connect to the remote computer",
      detail:
        `${target.hostname} is not accepting connections: ${target.reason ?? "no route to host"}. ` +
        `The usual causes are that the remote computer is turned off, remote access is not enabled, ` +
        `or the machine is unreachable on the network. Here it is the first of those.`,
    };
  }
  return { reason: "Connection failed", detail: "The remote host closed the connection." };
}
