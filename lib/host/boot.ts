/**
 * ITQuest — Boot sequence script (pure)
 * =====================================
 * What DeskOS claims to be doing while it starts, and how long it takes.
 *
 * Data rather than markup so the spec can assert the one property that
 * actually matters to the player: the whole thing fits inside the budget. A
 * boot screen that drifts past four seconds because someone added two lines is
 * a boot screen people learn to skip, and then the first-run impression is a
 * button labelled "Skip".
 *
 * ── EVERY LINE NAMES A REAL SUBSYSTEM ───────────────────────────────────────
 *
 * PoE budgets, IPAM, backup tiers, the SLA clock, the ticket queue — each is a
 * thing this simulation genuinely models. Invented kernel noise is recognised
 * as invented by exactly the audience this product has, and it wastes three
 * seconds that could be telling a new player what is in the box.
 *
 * ── PACING ──────────────────────────────────────────────────────────────────
 *
 * `ms` is the gap BEFORE each line, and the values vary deliberately. Equal
 * stagger produces a metronome; real hardware pauses on the slow probes and
 * rattles through the fast ones. The variation is what makes it read as a
 * machine rather than as an animation.
 */

export type BootTone = "ok" | "info" | "warn";

export interface BootLine {
  label: string;
  status: string;
  tone: BootTone;
  /** Delay before this line appears, measured from the previous one. */
  ms: number;
}

export const BOOT_LINES: BootLine[] = [
  { label: "deskos: kernel 6.8.0-itq — memory map ok", status: "OK", tone: "ok", ms: 140 },
  { label: "cpu: 8 cores online · microcode current", status: "OK", tone: "ok", ms: 90 },
  { label: "mount: /dev/sda1 on / (ext4, rw)", status: "OK", tone: "ok", ms: 110 },
  { label: "udev: enumerating rack hardware", status: "OK", tone: "ok", ms: 190 },
  { label: "net: bringing up eth0 · negotiating 1000baseT", status: "OK", tone: "ok", ms: 260 },
  { label: "ipam: loading address space · scanning for conflicts", status: "OK", tone: "ok", ms: 180 },
  { label: "poe: reading switch power budgets", status: "OK", tone: "ok", ms: 130 },
  { label: "dhcp: lease acquired · gateway reachable", status: "OK", tone: "ok", ms: 210 },
  { label: "directory: binding to domain controller", status: "OK", tone: "ok", ms: 240 },
  { label: "backup: verifying offsite tier", status: "DEGRADED", tone: "warn", ms: 200 },
  { label: "sla: starting resolution clocks", status: "OK", tone: "ok", ms: 120 },
  { label: "itsm: opening ticket queue", status: "OK", tone: "ok", ms: 160 },
  { label: "session: establishing secure channel", status: "SECURE", tone: "info", ms: 230 },
  { label: "deskos: starting desktop shell", status: "READY", tone: "info", ms: 180 },
];

/**
 * The hard ceiling. The product brief said 3-4 seconds; this holds the script
 * to the lower half of that, because the budget is a promise about the WORST
 * case and boot screens are watched more than once.
 */
export const BOOT_BUDGET_MS = 3400;

/** When line `i` appears, measured from the start of the sequence. */
export function bootLineDelay(i: number): number {
  let t = 0;
  for (let k = 0; k <= i && k < BOOT_LINES.length; k++) t += BOOT_LINES[k].ms;
  return t;
}

/**
 * Total run time: the last line's delay, plus a beat to read it.
 *
 * The beat is not padding — without it the final "READY" is on screen for a
 * single frame, which reads as a glitch rather than as a conclusion.
 */
export const BOOT_HOLD_MS = 320;
export const BOOT_TOTAL_MS = bootLineDelay(BOOT_LINES.length - 1) + BOOT_HOLD_MS;
