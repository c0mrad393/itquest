/**
 * ITQuest — Windows Update model (pure)
 * =====================================
 * The state a Windows Update applet displays, and the transitions a ticket
 * drives it through.
 *
 * ── WHY THIS IS A MODEL AND NOT A COMPONENT ─────────────────────────────────
 *
 * The brief calls this "crucial for ticket troubleshooting", and that is a
 * statement about STATE, not about UI. A ticket needs to inject "this machine
 * fails to update with 0x80070002" and later detect that the operator fixed
 * it. If the scan/download/install progression lives inside a React component,
 * neither of those is possible: the ticket engine cannot reach into a
 * component's `useState`, and a win-condition cannot grade one.
 *
 * So the progression is a pure state machine over a plain object. The applet
 * renders it and calls the transitions; the ticket engine injects faults and
 * reads the same fields. Nothing about update behaviour lives in the view.
 *
 * ── ERROR CODES ARE CAUSES, NOT DECORATION ──────────────────────────────────
 *
 * Each code carries what actually produces it and what clears it, because the
 * teaching value is entirely in that mapping. A student who learns "0x80070002
 * means retry" has learned nothing; one who learns it means the update cache
 * is missing files and is cleared by resetting SoftwareDistribution has
 * learned the actual repair.
 */

/** Where a machine is in the update cycle. */
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restart-required"
  | "failed"
  | "up-to-date";

/** Where a machine gets its updates from. */
export type UpdateSource = "microsoft" | "wsus";

export interface InstalledUpdate {
  kb: string;
  title: string;
  /** Epoch ms. The view formats it. */
  installedAt: number;
  /** Updates that failed are listed too — history is not a success log. */
  outcome: "installed" | "failed";
  errorCode?: UpdateErrorCode;
}

export interface PendingUpdate {
  kb: string;
  title: string;
  sizeMb: number;
  /** Security updates are the ones a ticket will care about being blocked. */
  category: "security" | "quality" | "driver" | "feature";
}

export type UpdateErrorCode = "0x80070002" | "0x80240020" | "0x800f081f" | "0x8024402c";

export interface UpdateErrorMeta {
  code: UpdateErrorCode;
  /** What Windows says. */
  label: string;
  /** What is actually wrong — the part that is worth learning. */
  cause: string;
  /** What clears it, phrased as the action an operator takes. */
  remedy: string;
}

/**
 * The four codes the brief named, plus the WSUS one, because a managed estate
 * hits it constantly and it is the code that most looks like a network fault
 * while being a policy fault.
 */
export const UPDATE_ERRORS: Record<UpdateErrorCode, UpdateErrorMeta> = {
  "0x80070002": {
    code: "0x80070002",
    label: "ERROR_FILE_NOT_FOUND",
    cause:
      "The update cache in SoftwareDistribution is missing or partially written, so the installer cannot find files it already recorded as downloaded.",
    remedy:
      "Stop the Windows Update service, rename C:\\Windows\\SoftwareDistribution, then start it again. The cache rebuilds on the next scan.",
  },
  "0x80240020": {
    code: "0x80240020",
    label: "WU_E_NO_INTERACTIVE_USER",
    cause:
      "The install needs an interactive session and none is present — most often because the update was scheduled to complete at a restart nobody performed.",
    remedy: "Sign in interactively and restart the machine to let the pending install finish.",
  },
  "0x800f081f": {
    code: "0x800f081f",
    label: "CBS_E_SOURCE_MISSING",
    cause:
      "A component the update depends on is missing from the local component store, and the machine cannot reach a source to repair it.",
    remedy:
      "Run DISM /Online /Cleanup-Image /RestoreHealth, or point the machine at a source that has the payload.",
  },
  "0x8024402c": {
    code: "0x8024402c",
    label: "WU_E_PT_WINHTTP_NAME_NOT_RESOLVED",
    cause:
      "The configured update server cannot be resolved. On a domain-joined machine this is nearly always a WSUS address in Group Policy pointing at a host that is gone, misspelled, or unreachable by DNS.",
    remedy:
      "Check the WSUS server address and whether it resolves. Verify DNS from the machine before suspecting the update service itself.",
  },
};

export interface WindowsUpdateState {
  phase: UpdatePhase;
  /** 0-100 while checking, downloading or installing. */
  progressPct: number;
  source: UpdateSource;
  /** WSUS server, when `source` is "wsus". */
  wsusServer: string | null;
  /** Set by Group Policy — the operator cannot change it from the applet. */
  managedByPolicy: boolean;
  automaticUpdates: boolean;
  /** Epoch ms the pause expires, or null when not paused. */
  pausedUntil: number | null;
  lastCheckedAt: number | null;
  pending: PendingUpdate[];
  history: InstalledUpdate[];
  /** Only meaningful in the "failed" phase. */
  error: UpdateErrorCode | null;
}

/** A healthy, freshly-scanned machine. */
export function freshUpdateState(now = Date.now()): WindowsUpdateState {
  return {
    phase: "up-to-date",
    progressPct: 0,
    source: "microsoft",
    wsusServer: null,
    managedByPolicy: false,
    automaticUpdates: true,
    pausedUntil: null,
    lastCheckedAt: now - 3_600_000,
    pending: [],
    history: [
      { kb: "KB5034123", title: "Cumulative Update for Windows", installedAt: now - 86_400_000 * 6, outcome: "installed" },
      { kb: "KB5033914", title: "Servicing Stack Update", installedAt: now - 86_400_000 * 20, outcome: "installed" },
      { kb: "KB890830", title: "Malicious Software Removal Tool", installedAt: now - 86_400_000 * 34, outcome: "installed" },
    ],
    error: null,
  };
}

/**
 * Is the machine allowed to check right now?
 *
 * Pause is a real block, not a UI hint — a paused machine that quietly checks
 * anyway would make the pause setting a lie, and "why is this box still
 * patching" is a genuine ticket.
 */
export function canCheck(s: WindowsUpdateState, now = Date.now()): boolean {
  if (s.phase === "checking" || s.phase === "downloading" || s.phase === "installing") return false;
  if (s.pausedUntil && s.pausedUntil > now) return false;
  return true;
}

/** Seven days, the interval the Windows UI offers. */
export const PAUSE_MS = 7 * 86_400_000;

export function pauseUpdates(s: WindowsUpdateState, now = Date.now()): WindowsUpdateState {
  return { ...s, pausedUntil: now + PAUSE_MS };
}

export function resumeUpdates(s: WindowsUpdateState): WindowsUpdateState {
  return { ...s, pausedUntil: null };
}

/**
 * Begin a scan.
 *
 * Refuses rather than silently no-ops when paused or already busy: the applet
 * shows why, and a ticket that expects a check to be blocked can assert it.
 */
export function beginCheck(s: WindowsUpdateState, now = Date.now()): WindowsUpdateState {
  if (!canCheck(s, now)) return s;
  return { ...s, phase: "checking", progressPct: 0, error: null };
}

/**
 * Finish a scan.
 *
 * `injectedError` is how a ticket makes a machine fail: the scan runs, looks
 * normal, and lands on a real code. A WSUS machine whose server does not
 * resolve fails HERE rather than at install, which is the correct place and
 * the reason 0x8024402c is so often misread as a broken update service.
 */
export function completeCheck(
  s: WindowsUpdateState,
  found: PendingUpdate[],
  injectedError: UpdateErrorCode | null = null,
  now = Date.now(),
): WindowsUpdateState {
  if (injectedError) {
    return { ...s, phase: "failed", progressPct: 0, error: injectedError, lastCheckedAt: now };
  }
  return {
    ...s,
    phase: found.length ? "available" : "up-to-date",
    progressPct: 0,
    pending: found,
    error: null,
    lastCheckedAt: now,
  };
}

/** Install everything pending. Fails loudly when a ticket says it should. */
export function installPending(
  s: WindowsUpdateState,
  injectedError: UpdateErrorCode | null = null,
  now = Date.now(),
): WindowsUpdateState {
  if (s.phase !== "available" || !s.pending.length) return s;

  if (injectedError) {
    // A failed install is written to HISTORY, not just to the banner. An
    // operator arriving after the fact needs to see that it was attempted —
    // a history that only lists successes hides the whole problem.
    return {
      ...s,
      phase: "failed",
      progressPct: 0,
      error: injectedError,
      history: [
        ...s.pending.map((p) => ({
          kb: p.kb,
          title: p.title,
          installedAt: now,
          outcome: "failed" as const,
          errorCode: injectedError,
        })),
        ...s.history,
      ],
    };
  }

  return {
    ...s,
    phase: "restart-required",
    progressPct: 100,
    pending: [],
    error: null,
    history: [
      ...s.pending.map((p) => ({
        kb: p.kb,
        title: p.title,
        installedAt: now,
        outcome: "installed" as const,
      })),
      ...s.history,
    ],
  };
}

/** Complete the pending install. The only way out of "restart-required". */
export function restartComplete(s: WindowsUpdateState, now = Date.now()): WindowsUpdateState {
  if (s.phase !== "restart-required") return s;
  return { ...s, phase: "up-to-date", progressPct: 0, lastCheckedAt: now };
}

/**
 * Point the machine at WSUS, as Group Policy would.
 *
 * `managedByPolicy` locks the applet's own controls, which is what a
 * domain-joined machine actually looks like — and the reason a student cannot
 * "just turn automatic updates back on" to fix a policy fault.
 */
export function applyWsusPolicy(
  s: WindowsUpdateState,
  server: string | null,
): WindowsUpdateState {
  return {
    ...s,
    source: server ? "wsus" : "microsoft",
    wsusServer: server,
    managedByPolicy: !!server,
  };
}

/** One line summarising the current state, for a status banner. */
export function updateSummary(s: WindowsUpdateState, now = Date.now()): string {
  if (s.pausedUntil && s.pausedUntil > now) {
    const days = Math.ceil((s.pausedUntil - now) / 86_400_000);
    return `Updates paused for ${days} more day${days === 1 ? "" : "s"}`;
  }
  switch (s.phase) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `${s.pending.length} update${s.pending.length === 1 ? "" : "s"} available`;
    case "downloading":
      return "Downloading updates…";
    case "installing":
      return "Installing updates…";
    case "restart-required":
      return "Restart required to finish installing updates";
    case "failed":
      return `Updates failed to install — ${s.error}`;
    case "up-to-date":
      return "You're up to date";
    default:
      return "Update status unknown";
  }
}

/**
 * Is this machine's updating healthy?
 *
 * The single predicate a ticket win-condition grades against, so the answer
 * lives here rather than being re-derived (slightly differently) at each call
 * site. A paused machine is NOT healthy: a pause is a deliberate hold, and a
 * ticket about a machine missing patches should not close because someone
 * pressed pause.
 */
export function updateHealthy(s: WindowsUpdateState, now = Date.now()): boolean {
  if (s.phase === "failed" || s.phase === "restart-required") return false;
  if (s.pausedUntil && s.pausedUntil > now) return false;
  if (s.source === "wsus" && !s.wsusServer) return false;
  return s.phase === "up-to-date";
}
