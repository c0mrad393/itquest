"use client";

/**
 * Tooltip + glossary term (v0.9.1)
 * ================================
 * MICRO-LEARNING, not documentation. The wiki explains subnetting in four
 * hundred words; a beginner who has just met the word "subnet" in a ticket
 * title does not want four hundred words, they want one sentence and their
 * place in the queue back. Anything that makes them leave the screen they are
 * on costs more than the term did.
 *
 * DESIGN RULES THIS FOLLOWS, and why each one is not optional:
 *
 *   - HOVER IS NOT THE ONLY WAY IN. Focus opens it too, and the trigger is a
 *     real <button>, so keyboard and screen-reader users get the definition
 *     rather than a dotted underline they can never resolve. Escape closes.
 *   - THE TOOLTIP NEVER COVERS ITS OWN TRIGGER. It flips above/below and
 *     clamps horizontally against the viewport; a definition that hides the
 *     word it defines is a worse experience than no definition.
 *   - IT IS NOT INTERACTIVE. No links, no buttons inside. That lets it be
 *     `pointer-events-none`, which means it can never swallow the click the
 *     operator was actually trying to make.
 *   - IT RENDERS IN A PORTAL, because every one of these lives inside a
 *     window with `overflow: hidden`, which would otherwise clip it.
 *
 * A short open delay keeps the UI from flickering definitions at someone
 * merely moving the mouse across a dense table; closing is immediate, because
 * a tooltip that lingers is in the way.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "@/lib/core/glossary";

const OPEN_DELAY = 220;

interface Pos {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

export function Tooltip({
  content,
  title,
  children,
  maxWidth = 260,
}: {
  content: ReactNode;
  /** Optional bolded first line — the term itself, usually. */
  title?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  }, []);

  const open = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Flip below when there is not enough room above.
      const placement: Pos["placement"] = r.top < 96 ? "bottom" : "top";
      const half = maxWidth / 2;
      const left = Math.min(
        Math.max(r.left + r.width / 2, half + 8),
        window.innerWidth - half - 8,
      );
      setPos({
        left,
        top: placement === "top" ? r.top - 8 : r.bottom + 8,
        placement,
      });
    }, OPEN_DELAY);
  }, [maxWidth]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /*
   * Keyboard access via NATIVE focusin/focusout on the wrapper rather than
   * React's onFocus/onBlur props. Both work; these are the bubbling native
   * pair, and keeping the open/close triggers on the same element as the
   * measurement ref means there is one place to look when placement is wrong.
   *
   * Verified by focusing the trigger and reading back the rendered tooltip,
   * not by assuming — and note for anyone testing this the same way: a
   * programmatic .focus() fires no focus events at all while the browser
   * window itself is unfocused, which looks exactly like a broken handler.
   */
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    el.addEventListener("focusin", open);
    el.addEventListener("focusout", close);
    return () => {
      el.removeEventListener("focusin", open);
      el.removeEventListener("focusout", close);
    };
  }, [open, close]);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // Any scroll invalidates the measured position; closing beats re-measuring
    // on every frame for something this transient.
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos, close]);

  return (
    <>
      <span
        ref={anchor}
        onMouseEnter={open}
        onMouseLeave={close}
        aria-describedby={pos ? id : undefined}
        className="inline-flex"
      >
        {children}
      </span>

      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              left: pos.left,
              top: pos.top,
              maxWidth,
              transform: `translate(-50%, ${pos.placement === "top" ? "-100%" : "0"})`,
            }}
            className="pointer-events-none fixed z-[400] animate-[tooltipIn_140ms_ease-out] rounded-lg border border-edge bg-surface px-3 py-2 shadow-panel"
          >
            {title && (
              <div className="mb-0.5 text-[11px] font-semibold text-gray-100">{title}</div>
            )}
            <div className="text-[11px] leading-relaxed text-gray-300">{content}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * A jargon term with its definition attached.
 *
 * The dotted underline is the affordance rather than a `[?]` icon in running
 * text: an icon after every acronym in a dense table adds a column of visual
 * noise and pushes the layout around, while an underline sits inside the word
 * and costs nothing. `withIcon` is there for headings and labels, where a term
 * stands alone and a small mark reads as helpful rather than cluttered.
 */
export function Term({
  k,
  children,
  withIcon = false,
}: {
  k: GlossaryKey;
  /** Override the visible text; defaults to the glossary's own label. */
  children?: ReactNode;
  withIcon?: boolean;
}) {
  const entry = GLOSSARY[k];
  if (!entry) return <>{children}</>;

  return (
    <Tooltip
      title={entry.term}
      content={
        <>
          {entry.short}
          {entry.why && <span className="mt-1 block text-gray-400">{entry.why}</span>}
        </>
      }
    >
      <button
        type="button"
        // A real button so it is tabbable and announced; the visual weight is
        // entirely in the underline, so it never looks like a call to action.
        className="cursor-help border-0 bg-transparent p-0 font-[inherit] text-[inherit] leading-[inherit] text-current underline decoration-dotted decoration-from-font underline-offset-2 transition hover:text-brand-text focus-visible:text-brand-text"
        onClick={(e) => e.preventDefault()}
      >
        {children ?? entry.term}
        {withIcon && <span aria-hidden="true" className="ml-0.5 text-[0.85em] opacity-70">?</span>}
      </button>
    </Tooltip>
  );
}
