"use client";

/**
 * ITQuest — Copy to clipboard
 * ===========================
 * A small affordance that copies a value and confirms it.
 *
 * ── THE CONFIRMATION IS THE FEATURE ─────────────────────────────────────────
 *
 * A copy button with no feedback gets pressed two or three times, because the
 * operator has no way to tell whether it worked and clipboard failures are
 * silent. The tick is what stops that, and it holds long enough to be seen
 * (1.4s) rather than the 300ms that looks tidy in isolation and is missed in
 * practice.
 *
 * ── AND SO IS THE FAILURE ───────────────────────────────────────────────────
 *
 * `navigator.clipboard` is unavailable on insecure origins and can be denied
 * by permission policy. Swallowing that leaves an operator convinced they
 * copied an IP they did not. The button shows a cross and the reason instead.
 *
 * SVG icons only — no emoji.
 */

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy, IconX } from "@/components/ui/icons";

type State = "idle" | "ok" | "fail";

export default function CopyButton({
  value,
  label,
  size = 11,
  className = "",
}: {
  value: string;
  /** What is being copied, for the accessible name ("Copy IP address"). */
  label?: string;
  size?: number;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(e: React.MouseEvent) {
    // These sit inside rows and cards that have their own click behaviour;
    // copying a hostname must not also open the thing it names.
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("fail");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1400);
  }

  const title =
    state === "ok" ? "Copied" : state === "fail" ? "Clipboard unavailable" : `Copy ${label ?? "value"}`;

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 align-middle transition-colors ${
        state === "ok"
          ? "text-accent-strong"
          : state === "fail"
            ? "text-danger-strong"
            : "text-gray-500 hover:bg-gray-500/15 hover:text-gray-200"
      } ${className}`}
    >
      {state === "ok" ? (
        <IconCheck size={size} />
      ) : state === "fail" ? (
        <IconX size={size} />
      ) : (
        <IconCopy size={size} />
      )}
    </button>
  );
}

/**
 * A monospaced value with a copy button beside it.
 *
 * The pairing exists because these two are always written together — an IP, a
 * hostname, a ticket code — and separating them means every call site decides
 * spacing and alignment again, slightly differently.
 */
export function CopyableValue({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`group/copy inline-flex items-center gap-1 ${className}`}>
      <span className="font-mono">{value}</span>
      <CopyButton
        value={value}
        label={label}
        className="opacity-0 transition-opacity group-hover/copy:opacity-100 focus-visible:opacity-100"
      />
    </span>
  );
}
