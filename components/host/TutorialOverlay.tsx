"use client";

/**
 * ITQuest — Tutorial overlay (spotlight)
 * =======================================
 * Dims the workstation, cuts a hole over the element the current step is
 * about, and floats a glass card next to it. Presentation and measurement
 * only: every decision about WHICH step is showing belongs to the director.
 *
 * ── THE CUTOUT IS A BOX-SHADOW, NOT AN SVG MASK ─────────────────────────────
 *
 * One absolutely-positioned box over the target with a 9999px shadow spread
 * paints everything outside it and nothing inside, with a real border-radius
 * on the hole. An SVG mask would need a second element for the ring and its
 * corners would have to be kept in sync by hand.
 *
 * The shadow does not receive pointer events — shadows never do — which is
 * exactly what we want for the hole, and exactly wrong for the rest of the
 * screen. So blocking is a separate concern: four invisible SHUTTERS around
 * the target. The operator can click the highlighted control and nothing else,
 * and the highlighted control is the real one, still wired to the real app.
 *
 * ── FOUR MODES, BECAUSE A MISSING TARGET MUST NOT TRAP ANYONE ───────────────
 *
 *   spotlight  target found        cutout + shutters + anchored card
 *   centered   step.target = null  full scrim + centred card (informational
 *                                  steps only, so blocking costs nothing)
 *   searching  target not measured  nothing rendered at all — one frame
 *   detached   target gave up      NO scrim, NO shutters, card parked out of
 *                                  the way
 *
 * The last two are the important ones, and both exist to enforce a single
 * rule: A STEP THAT NAMES A TARGET CAN NEVER BLOCK THE SCREEN. An action step
 * whose target has gone missing — a panel that scrolled away, an app the
 * operator closed, a backgrounded tab that stopped the measurement loop —
 * would otherwise put shutters over the entire workstation while waiting for a
 * click on something that is not there. The worst case here is an unhelpful
 * card in a corner, never a soft-lock.
 *
 * ── MEASUREMENT IS A rAF LOOP, ON PURPOSE ───────────────────────────────────
 *
 * There is no event for "the thing I am pointing at moved". Windows here are
 * dragged, resized, maximised and animated; panels scroll inside them. resize
 * and scroll listeners catch some of that and miss a drag entirely. A frame
 * loop that re-measures and only sets state when the rect actually changed is
 * both simpler and correct, and it costs one getBoundingClientRect per frame
 * while a tour is on screen and nothing at all when it is not.
 *
 * SVG icons only — no emoji.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTutorialStore } from "@/lib/tutorial/store";
import {
  isActionStep,
  sequenceById,
  stepAt,
  type TutorialIconId,
  type TutorialStep,
} from "@/lib/tutorial/flow";
import {
  IconBolt,
  IconCheck,
  IconChevronRight,
  IconCompass,
  IconHealth,
  IconList,
  IconRemoteIn,
  IconSliders,
  IconTicket,
  IconWrench,
  IconX,
  type IconProps,
} from "@/components/ui/icons";

/** Step icon keys resolved to components. Kept here so flow.ts stays JSX-free. */
const TUTORIAL_ICONS: Record<TutorialIconId, (p: IconProps) => JSX.Element> = {
  compass: IconCompass,
  health: IconHealth,
  ticket: IconTicket,
  list: IconList,
  check: IconCheck,
  bolt: IconBolt,
  wrench: IconWrench,
  sliders: IconSliders,
  remote: IconRemoteIn,
};

/** Breathing room between the highlighted element and the edge of the hole. */
const HOLE_PAD = 8;
/** Gap between the hole and the card. */
const CARD_GAP = 14;
/** Keep the card this far from the viewport edge. */
const EDGE = 16;
const CARD_W = 360;
/**
 * How long a target may be missing before the overlay stops waiting and goes
 * detached.
 *
 * Sized for the SLOWEST legitimate case, which is not a mount — it is a smooth
 * scrollIntoView on a long panel, and that runs on the browser's own timing.
 * Under-budgeting here would flip a step to "looking for it" mid-scroll, one
 * frame before the target arrived.
 */
const SEARCH_GRACE_MS = 1600;
/** How long to let a scroll attempt land before trying a blunter one. */
const SCROLL_RETRY_MS = 420;
/** Past this, assume the operator is scrolling away deliberately. */
const MAX_SCROLL_TRIES = 4;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Is the element in the layout at all — laid out, sized, not display:none? */
function isRendered(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
}

/** Is it inside the viewport, so a spotlight over it would be visible? */
function isOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/**
 * Track a `data-tutorial-target` element's viewport rect.
 *
 * `found` distinguishes "still looking" from "gave up", which is what selects
 * detached mode; the two must not be collapsed into `rect === null` or the
 * overlay would flash detached for a frame every time a target re-mounts.
 */
function useTargetRect(key: string | null): { rect: Rect | null; givenUp: boolean } {
  const [rect, setRect] = useState<Rect | null>(null);
  const [givenUp, setGivenUp] = useState(false);

  useEffect(() => {
    if (!key) {
      setRect(null);
      setGivenUp(false);
      return;
    }
    setGivenUp(false);
    let raf = 0;
    let cached: HTMLElement | null = null;
    let lastRect: Rect | null = null;
    const startedAt = performance.now();
    let seenOnce = false;
    let scrollTries = 0;
    let lastScrollAt = 0;

    const tick = () => {
      // Re-query only when the cached node has left the document — the common
      // case is a stable node being re-measured, and querySelector every frame
      // for that would be waste.
      if (!cached || !cached.isConnected) {
        cached = document.querySelector<HTMLElement>(`[data-tutorial-target="${key}"]`);
      }
      let next: Rect | null = null;
      if (cached && cached.isConnected && isRendered(cached)) {
        /*
         * BRING THE TARGET TO THE OPERATOR.
         *
         * A target can be perfectly real and still be scrolled out of sight
         * inside a panel — the Accept button sits below the fold of the ticket
         * detail on a short window, which is exactly where the tour wants to
         * point on step five. Without this the overlay would correctly report
         * that it cannot see the element and fall back to a card in the corner
         * saying "looking for it", while the thing it wants is sixty pixels
         * below the scroll line.
         *
         * THE ATTEMPT IS VERIFIED RATHER THAN ASSUMED. A smooth scroll is an
         * animation, and animations do not always run: measured in a
         * backgrounded tab, `behavior: "smooth"` moved the target zero pixels
         * while `"auto"` moved it the full 307 it needed. Firing once and
         * latching a flag would have pinned that step to "looking for it"
         * permanently. So each attempt is re-checked a few frames later, and
         * the retry drops the animation and jumps.
         *
         * Capped, because past a handful of tries the operator is scrolling
         * away on purpose and the tour should stop wrestling them for the
         * scrollbar.
         */
        if (!isOnScreen(cached)) {
          const now = performance.now();
          if (scrollTries < MAX_SCROLL_TRIES && now - lastScrollAt > SCROLL_RETRY_MS) {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            cached.scrollIntoView({
              block: "center",
              // Pretty on the first go, reliable on every one after it.
              behavior: reduce || scrollTries > 0 ? "auto" : "smooth",
            });
            scrollTries++;
            lastScrollAt = now;
          }
        } else {
          const r = cached.getBoundingClientRect();
          next = {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
          seenOnce = true;
        }
      }
      if (!sameRect(next, lastRect)) {
        lastRect = next;
        setRect(next);
      }
      // Give up only if it was never there. A target that appeared and then
      // scrolled out of view keeps the tour in spotlight mode waiting for it
      // to come back, which is what a scrolled-away panel should do.
      if (!next && !seenOnce && performance.now() - startedAt > SEARCH_GRACE_MS) {
        setGivenUp(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);

  return { rect, givenUp };
}

type Side = "top" | "bottom" | "left" | "right";

/**
 * Put the card beside the hole, flipping to the opposite side when the
 * preferred one does not fit and clamping onto the viewport either way.
 *
 * Clamping after flipping (rather than instead of it) matters: a target near
 * the bottom of the screen with `side: "bottom"` should move ABOVE it, not sit
 * on top of it pushed up by a clamp.
 */
function placeCard(hole: Rect, card: { w: number; h: number }, want: Side) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits: Record<Side, boolean> = {
    top: hole.y - CARD_GAP - card.h >= EDGE,
    bottom: hole.y + hole.h + CARD_GAP + card.h <= vh - EDGE,
    left: hole.x - CARD_GAP - card.w >= EDGE,
    right: hole.x + hole.w + CARD_GAP + card.w <= vw - EDGE,
  };
  const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  // Preferred, then its opposite, then anything that fits, then preferred
  // anyway with a clamp — there is always an answer, never an empty screen.
  const side: Side = fits[want]
    ? want
    : fits[opposite[want]]
      ? opposite[want]
      : ((["bottom", "top", "right", "left"] as Side[]).find((s) => fits[s]) ?? want);

  let x: number;
  let y: number;
  if (side === "top" || side === "bottom") {
    x = hole.x + hole.w / 2 - card.w / 2;
    y = side === "top" ? hole.y - CARD_GAP - card.h : hole.y + hole.h + CARD_GAP;
  } else {
    x = side === "left" ? hole.x - CARD_GAP - card.w : hole.x + hole.w + CARD_GAP;
    y = hole.y + hole.h / 2 - card.h / 2;
  }
  return {
    side,
    x: Math.round(Math.min(Math.max(x, EDGE), Math.max(EDGE, vw - card.w - EDGE))),
    y: Math.round(Math.min(Math.max(y, EDGE), Math.max(EDGE, vh - card.h - EDGE))),
  };
}

export default function TutorialOverlay() {
  const activeSequence = useTutorialStore((s) => s.activeSequence);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const skipActive = useTutorialStore((s) => s.skipActive);

  const seq = activeSequence ? sequenceById(activeSequence) : undefined;
  const step = seq ? stepAt(seq, currentStepIndex) : null;

  if (!seq || !step) return null;
  return (
    <TutorialStepView
      // Remount per step so measurement, focus and the entrance animation all
      // start clean rather than inheriting the previous step's geometry.
      key={`${seq.id}:${step.id}`}
      step={step}
      title={seq.title}
      index={currentStepIndex}
      total={seq.steps.length}
      onNext={nextStep}
      onSkip={skipActive}
    />
  );
}

function TutorialStepView({
  step,
  title,
  index,
  total,
  onNext,
  onSkip,
}: {
  step: TutorialStep;
  title: string;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { rect, givenUp } = useTargetRect(step.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: CARD_W, h: 200 });
  const [nudge, setNudge] = useState(0);
  const waiting = isActionStep(step);

  /*
   * Mode selection, and the ONLY path to a blocking scrim is a step that
   * declared no target at all.
   *
   * The obvious version — "no rect yet, so show the centred card" — puts a
   * full-screen blocker up while the overlay is still looking for the element
   * it is about to ask the operator to click. Measurement normally lands on
   * the first frame, but "normally" is doing real work there: rAF does not run
   * at all while the tab is backgrounded, so returning to a hidden tab
   * mid-tour would restore a blocked screen over an un-clickable target. The
   * fix is structural rather than a longer grace period — a step with a target
   * can never block.
   *
   * `searching` renders nothing. It lasts a frame in practice, and showing
   * nothing for a frame beats showing the card somewhere it is about to jump
   * away from.
   */
  const mode: "spotlight" | "centered" | "detached" | "searching" =
    step.target === null ? "centered" : rect ? "spotlight" : givenUp ? "detached" : "searching";

  // Measure the card itself: its height depends on how long the body copy is,
  // and placement cannot be right until we know it. Keyed on `mode` because
  // the card is not in the tree during `searching`, and an effect that ran
  // once against a null ref would never attach the observer.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCardSize((prev) =>
        Math.round(r.width) === prev.w && Math.round(r.height) === prev.h
          ? prev
          : { w: Math.round(r.width), h: Math.round(r.height) },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // Escape leaves the tour. Anything modal owes the operator a way out that
  // does not require finding a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const bump = useCallback(() => setNudge((n) => n + 1), []);

  // Every hook above has run, so bailing out here is safe.
  if (mode === "searching") return null;

  const hole: Rect | null = rect
    ? { x: rect.x - HOLE_PAD, y: rect.y - HOLE_PAD, w: rect.w + HOLE_PAD * 2, h: rect.h + HOLE_PAD * 2 }
    : null;

  const placed =
    mode === "spotlight" && hole
      ? placeCard(hole, cardSize, step.side)
      : mode === "detached"
        ? {
            side: "bottom" as Side,
            // Parked bottom-left, clear of the taskbar and of the centre of
            // the screen, because in this mode the operator is looking for
            // something we could not point at.
            x: EDGE,
            y: Math.max(EDGE, window.innerHeight - cardSize.h - 72),
          }
        : null;

  const Icon = TUTORIAL_ICONS[step.icon];

  return (
    /*
     * `theme-dark` is pinned for the same reason the landing page pins it: the
     * scrim is dark in BOTH themes — dimming means darkening, whatever the
     * operator's preference — so the card sits on a dark ground and its
     * neutrals must resolve dark. Without this, a light-mode operator gets
     * dark-on-dark text on the one surface that exists to be readable.
     */
    <div className="theme-dark pointer-events-none fixed inset-0 z-[10050] font-sans">
      {/* ── The dim ─────────────────────────────────────────────────────── */}
      {mode === "spotlight" && hole && (
        <div
          aria-hidden="true"
          className="tut-hole absolute rounded-xl"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        />
      )}
      {mode === "centered" && (
        <div aria-hidden="true" className="pointer-events-auto absolute inset-0 bg-[#020610]/75 backdrop-blur-[2px]" />
      )}

      {/* ── The ring ────────────────────────────────────────────────────── */}
      {mode === "spotlight" && hole && (
        <div
          aria-hidden="true"
          key={nudge}
          className={`tut-ring absolute rounded-xl ${nudge ? "tut-shake" : ""}`}
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        />
      )}

      {/*
        ── The shutters ──────────────────────────────────────────────────
        Four transparent panels that swallow clicks everywhere except the
        hole. Clicking one nudges the ring rather than doing nothing: silence
        reads as a broken UI, a flick of movement reads as "not that, this".
      */}
      {mode === "spotlight" && hole && <Shutters hole={hole} onBlockedClick={bump} />}

      {/* ── The card ────────────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={mode !== "detached"}
        aria-labelledby="tut-title"
        className="tut-card pointer-events-auto absolute w-[min(22.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1120]/85 shadow-2xl shadow-black/60 backdrop-blur-xl"
        style={
          placed
            ? { left: placed.x, top: placed.y }
            : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        {/* Brand hairline: the one piece of colour, so the card reads as part
            of the product rather than as a browser dialog. */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#67e8f9]/60 to-transparent" />

        <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#22d3ee]/25 bg-[#22d3ee]/10 text-[#67e8f9]">
            <Icon size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span className="truncate">{title}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">
                {index + 1} / {total}
              </span>
            </div>
            <h2 id="tut-title" className="mt-1 text-[14px] font-semibold leading-snug text-white">
              {step.title}
            </h2>
          </div>
          <button
            onClick={onSkip}
            aria-label="Skip this tour"
            className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
          >
            <IconX size={13} />
          </button>
        </div>

        <p className="px-4 text-[12.5px] leading-relaxed text-slate-400">{step.body}</p>

        <div className="mt-3.5 flex items-center gap-3 border-t border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
          {/* Progress dots: cheaper to read at a glance than the counter, and
              they show how much is left rather than only where you are. */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === index ? "w-4 bg-[#67e8f9]" : i < index ? "w-1 bg-slate-500" : "w-1 bg-slate-700"
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {waiting ? (
              /* An action step has no Next button by design: the way past it
                 is to do the thing. Saying so beats a disabled button the
                 operator will try to click. */
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#67e8f9]">
                <span className="tut-pip h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />
                {mode === "detached" ? "Looking for it" : "Your move"}
              </span>
            ) : (
              <button
                onClick={onNext}
                autoFocus
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0a1120] transition hover:bg-slate-200 active:scale-[0.98]"
              >
                {index + 1 === total ? "Start working" : "Got it"}
                <IconChevronRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The four click-blocking panels around the hole. */
function Shutters({ hole, onBlockedClick }: { hole: Rect; onBlockedClick: () => void }) {
  const common = "pointer-events-auto absolute";
  const right = hole.x + hole.w;
  const bottom = hole.y + hole.h;
  return (
    <div aria-hidden="true" onMouseDown={onBlockedClick}>
      <div className={common} style={{ left: 0, top: 0, width: "100%", height: Math.max(0, hole.y) }} />
      <div className={common} style={{ left: 0, top: bottom, width: "100%", bottom: 0 }} />
      <div className={common} style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
      <div className={common} style={{ left: right, top: hole.y, right: 0, height: hole.h }} />
    </div>
  );
}
