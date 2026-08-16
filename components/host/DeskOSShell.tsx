"use client";

/**
 * ITQuest — DeskOS shell
 * ======================
 * Boot screen, then desktop.
 *
 * A client wrapper exists because the boot decision is a browser question —
 * "has this session already booted?" lives in sessionStorage — and
 * `app/desktop/page.tsx` is a server component. Putting the boot inside
 * HostDesktop instead would mean the whole desktop, every headless engine and
 * every store subscription mounting behind a screen that is covering them,
 * which is both wasteful and a source of engines firing at a player who cannot
 * see or act on them yet.
 *
 * So the desktop does not exist until the boot is done. The one cost is that
 * world generation starts a beat later, which is invisible next to three
 * seconds of boot.
 */

import { useEffect, useState } from "react";
import HostDesktop from "./HostDesktop";
import BootSequence, { hasBootedThisSession } from "./BootSequence";

export default function DeskOSShell() {
  /*
   * `null` means "not decided yet", and it is deliberately not `false`.
   *
   * sessionStorage cannot be read during SSR or the first client render, so
   * starting at `false` would render the boot screen for one frame at every
   * returning operator before snapping it away. Rendering nothing for that
   * frame is the honest option.
   */
  const [booting, setBooting] = useState<boolean | null>(null);

  useEffect(() => {
    setBooting(!hasBootedThisSession());
  }, []);

  if (booting === null) return <div className="h-screen w-screen bg-sunken" />;
  if (booting) return <BootSequence onDone={() => setBooting(false)} />;
  return <HostDesktop />;
}
