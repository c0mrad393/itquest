"use client";

/**
 * Remote-session chrome (v0.9.1)
 * ==============================
 * THE PROBLEM. Beginners could not tell whether they were operating their own
 * workstation or a machine three network hops away. Both were dark panels with
 * the same taskbar idiom, and the only difference was a line of small grey
 * text. Players ran host tools expecting them to affect the remote box, and —
 * worse for a teaching tool — learned nothing about the boundary they were
 * crossing, which is the single most important concept in remote support.
 *
 * THE FIX, in the order the eye reads it:
 *
 *   1. A CONNECTION BANNER pinned to the top of every session, modelled on the
 *      Remote Desktop bar: host identity, connection quality, and Disconnect.
 *      It is DARK IN BOTH THEMES on purpose. Every other surface in the
 *      product follows the operator's theme; this one does not, because its
 *      whole job is to look like it belongs to a different computer. A banner
 *      that turned white with the rest of the UI would be the one element that
 *      failed at the one thing it exists for.
 *
 *   2. A TINT AND A BORDER on the session body — cool blue, distinct from the
 *      host's neutral greys — so the difference survives even when the banner
 *      is scrolled past or the window is small.
 *
 *   3. A DIFFERENT SHADOW on the window frame (`shadow-remote`), so a remote
 *      window reads as sitting further away than a host window even before you
 *      look at its contents.
 *
 * Contrast: --remote-bar-fg on --remote-bar is 12.6:1 dark and 11.9:1 light;
 * the muted variants stay above 4.5:1 on the same ground.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import type { ReactNode } from "react";
import { IconRemoteIn, IconSignal } from "@/components/ui/icons";

export type RemoteKind = "server" | "endpoint";

interface BannerProps {
  /** The machine you are inside — its name is the headline, not a detail. */
  hostname: string;
  ip: string;
  port?: number;
  protocol: string;
  latencyMs?: number;
  /** "connected" renders calm; anything else renders as still-negotiating. */
  status?: string;
  kind?: RemoteKind;
  onDisconnect?: () => void;
  /** Extra controls (session-specific actions) rendered before Disconnect. */
  children?: ReactNode;
}

/** Four bars, filled by latency. Under 40ms is excellent, over 150 is poor. */
function quality(latencyMs?: number): { bars: number; label: string } {
  if (latencyMs == null) return { bars: 4, label: "Connection quality: excellent" };
  if (latencyMs < 40) return { bars: 4, label: `Excellent connection · ${latencyMs} ms` };
  if (latencyMs < 90) return { bars: 3, label: `Good connection · ${latencyMs} ms` };
  if (latencyMs < 150) return { bars: 2, label: `Fair connection · ${latencyMs} ms` };
  return { bars: 1, label: `Poor connection · ${latencyMs} ms` };
}

export function RemoteConnectionBanner({
  hostname,
  ip,
  port,
  protocol,
  latencyMs,
  status = "connected",
  kind = "server",
  onDisconnect,
  children,
}: BannerProps) {
  const live = status === "connected";
  const q = quality(latencyMs);

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-remote-edge bg-remote-bar px-3 py-1.5 text-remote-bar-fg">
      {/*
        The plain-language line comes FIRST and in the largest type on the bar.
        "RDP 10.42.4.30:3389" told an operator who already knew what RDP was
        something they could infer anyway; "You are connected to CLAR-FS-07"
        tells a beginner the one thing they actually needed.
      */}
      <IconRemoteIn size={14} className="shrink-0 opacity-90" />
      <span className="min-w-0 truncate text-[12px] font-medium">
        <span className="opacity-75">You are connected to</span>{" "}
        <span className="font-semibold">{hostname}</span>
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <span className="rounded border border-remote-bar-fg/25 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider opacity-85">
          {protocol}
        </span>
        <span className="font-mono text-[10px] opacity-75">
          {ip}
          {port ? `:${port}` : ""}
        </span>
      </span>

      {/* Connection quality, as bars rather than a number nobody calibrates. */}
      <span className="ml-auto flex shrink-0 items-center gap-1.5" title={q.label} aria-label={q.label}>
        <span className="flex items-end gap-px" aria-hidden="true">
          {[1, 2, 3, 4].map((b) => (
            <span
              key={b}
              className={`w-[3px] rounded-sm transition ${
                b <= q.bars ? "bg-remote-bar-fg" : "bg-remote-bar-fg/25"
              }`}
              style={{ height: 3 + b * 2 }}
            />
          ))}
        </span>
        <span className="hidden font-mono text-[10px] opacity-75 md:inline">
          {latencyMs != null ? `${latencyMs} ms` : "—"}
        </span>
      </span>

      {!live && (
        <span className="shrink-0 animate-pulse text-[10px] capitalize opacity-85">{status}</span>
      )}

      {children}

      {onDisconnect && (
        <button
          onClick={onDisconnect}
          className="shrink-0 rounded border border-remote-bar-fg/30 px-2 py-0.5 text-[10px] font-medium text-remote-bar-fg transition hover:bg-danger hover:border-danger hover:text-white"
        >
          Disconnect
        </button>
      )}

      <span className="sr-only">
        This is a remote {kind === "server" ? "server" : "workstation"} session. Actions here affect{" "}
        {hostname}, not your own machine.
      </span>
    </div>
  );
}

/**
 * The session body. Wraps whatever OS surface is being simulated in the remote
 * tint so the boundary is visible at a glance, at any window size.
 */
export function RemoteSurface({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 bg-remote-tint">{children}</div>;
}

/**
 * A compact "you are remote" marker for places too small for the full banner —
 * a nested window's title bar, for instance.
 */
export function RemoteBadge({ hostname }: { hostname: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-remote-bar px-1.5 py-0.5 text-[9px] font-medium text-remote-bar-fg">
      <IconSignal size={9} />
      {hostname}
    </span>
  );
}
