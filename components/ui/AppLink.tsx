"use client";

/**
 * AppLink — a cross-app call to action that knows about locks (polish pass)
 * =========================================================================
 * Every "go and do this over there" button in the product.
 *
 * ── WHY THIS EXISTS RATHER THAN SIX HAND-ROLLED BUTTONS ─────────────────────
 *
 * There were six, each calling `openApp` directly, and none of them checked
 * whether the target was unlocked. Monitor's "View licence" put a level-2
 * operator into Procurement, which unlocks at level 4 — a straight bypass of
 * the progression tree.
 *
 * `openApp` now refuses a locked app outright, which closes the hole. But a
 * refusal is a poor experience on its own: the operator clicks a button that
 * looks live, and gets a toast telling them it was never going to work. The
 * button should have said so before they pressed it.
 *
 * So the gate is enforced in TWO places, on purpose, and they are not
 * redundant — they answer different questions. The store answers "may this
 * open?", which must hold for every caller including ones written later. This
 * answers "should this look available?", which is presentation and belongs at
 * the call site. A locked target renders as a lock with the level required,
 * and does not pretend.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useHostStore } from "@/lib/host/store";
import { HOST_APP_REGISTRY, type HostAppId } from "@/lib/core";
import { appUnlockLevel, isAppUnlocked } from "@/lib/progression/unlocks";
import { IconLock } from "@/components/ui/icons";

export default function AppLink({
  app,
  children,
  className = "btn-secondary btn-sm",
  /** Why the operator would want to go there — used in the locked tooltip. */
  purpose,
}: {
  app: HostAppId;
  children: React.ReactNode;
  className?: string;
  purpose?: string;
}) {
  const level = useHostStore((s) => s.host.user.level);
  const openApp = useHostStore((s) => s.openApp);
  const meta = HOST_APP_REGISTRY[app];
  const unlocked = isAppUnlocked(app, level);
  const need = appUnlockLevel(app);

  if (!unlocked) {
    return (
      <span
        className={`${className} pointer-events-none opacity-60`}
        title={`${meta.title} unlocks at level ${need}${purpose ? ` — ${purpose}` : ""}`}
        aria-label={`${meta.title} is locked until level ${need}`}
      >
        <IconLock size={11} /> {meta.title} · level {need}
      </span>
    );
  }

  return (
    <button className={className} onClick={() => openApp(app)}>
      {children}
    </button>
  );
}

/**
 * The inline variant, for prose that mentions an app mid-sentence.
 *
 * Same rule, quieter: a locked reference stays readable text with a lock
 * rather than becoming a dead link the reader has to test to discover.
 */
export function AppRef({ app, purpose }: { app: HostAppId; purpose?: string }) {
  const level = useHostStore((s) => s.host.user.level);
  const openApp = useHostStore((s) => s.openApp);
  const meta = HOST_APP_REGISTRY[app];
  const unlocked = isAppUnlocked(app, level);
  const need = appUnlockLevel(app);

  if (!unlocked) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-gray-500"
        title={`Unlocks at level ${need}${purpose ? ` — ${purpose}` : ""}`}
      >
        <IconLock size={9} />
        {meta.title} (level {need})
      </span>
    );
  }

  return (
    <button
      onClick={() => openApp(app)}
      className="text-brand-text underline decoration-dotted underline-offset-2 transition hover:text-brand-fill"
    >
      {meta.title}
    </button>
  );
}
