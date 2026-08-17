/**
 * ITQuest — Physical rig model (pure)
 * ===================================
 * The state of a machine that is open on the bench: what is seated in which
 * slot, which screws and clips are holding it, and which cables are plugged in.
 *
 * ── WHY THIS IS PURE AND THE STORE IS A SHELL ───────────────────────────────
 *
 * The brief asks that the hardware state be swappable onto a 3D canvas later.
 * That is only true if nothing about the rules lives in a component: a WebGL
 * scene and an SVG blueprint must be able to ask the SAME question ("can this
 * stick come out yet?") and get the same answer. So every rule is a pure
 * function over a plain object here, the Zustand store is a thin wrapper that
 * applies them, and the view is free to be anything.
 *
 * The blueprint's coordinates live on the slots for the same reason in reverse:
 * they are DATA, not layout code. A 3D view ignores `x/y/w/h` and reads the
 * same slot list; the SVG uses them. Neither view owns the board.
 *
 * ── ORDER OF OPERATIONS IS THE ENTIRE LESSON ────────────────────────────────
 *
 * A learner who can yank a GPU out without touching the retention screw or the
 * PCIe power lead has learned nothing transferable. So removal is GATED: the
 * model refuses, and says WHY, which is what lets the UI point at the next
 * thing to touch instead of just greying a button out.
 */

export type PartKind = "cpu" | "ram" | "gpu" | "psu" | "storage" | "fan";

/** A screw or a latch. Both are "release this before the part moves". */
export interface Fastener {
  id: string;
  label: string;
  /** Screws are driven, clips are closed — `true` means "holding". */
  kind: "screw" | "clip";
  fastened: boolean;
}

export interface Cable {
  id: string;
  label: string;
  kind: "power" | "data";
  /** Slot ids this cable runs between. Both ends are on the board or a part. */
  from: string;
  to: string;
  connected: boolean;
}

export interface Part {
  id: string;
  kind: PartKind;
  model: string;
  /**
   * A part can be present and correct in every visible way and still be dead.
   * That is the point of the faulty-RAM scenario: nothing on the board LOOKS
   * wrong, and the fault is only visible in what the machine does at POST.
   */
  faulty?: boolean;
}

export interface Slot {
  id: string;
  kind: PartKind;
  label: string;
  /** Blueprint geometry, in board grid units. Data, not layout code. */
  x: number;
  y: number;
  w: number;
  h: number;
  part: Part | null;
  fasteners: Fastener[];
  /** Cables that must be clear before the part in this slot can move. */
  cableIds: string[];
  /** Slots that must stay populated for POST (a board needs a CPU). */
  required?: boolean;
}

export interface Rig {
  slots: Slot[];
  cables: Cable[];
  /** Parts on the bench, not yet installed. */
  tray: Part[];
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function slotById(rig: Rig, id: string): Slot | undefined {
  return rig.slots.find((s) => s.id === id);
}

export function cablesFor(rig: Rig, slot: Slot): Cable[] {
  return rig.cables.filter((c) => slot.cableIds.includes(c.id));
}

/**
 * Why this part cannot come out yet — or null when it can.
 *
 * Returns the REASON rather than a boolean so the UI can name the next action.
 * "Remove is disabled" teaches nothing; "release the retention clips" is the
 * instruction the learner needs, and it comes from the model so a 3D view gets
 * it for free.
 */
export function blockedReason(rig: Rig, slotId: string): string | null {
  const slot = slotById(rig, slotId);
  if (!slot) return "No such slot";
  if (!slot.part) return "Slot is already empty";

  const held = slot.fasteners.filter((f) => f.fastened);
  if (held.length) {
    const clips = held.filter((f) => f.kind === "clip");
    const screws = held.filter((f) => f.kind === "screw");
    if (clips.length) return `Release ${clips.length === 1 ? "the clip" : `both clips`} first`;
    return `Undo ${screws.length === 1 ? "the screw" : `${screws.length} screws`} first`;
  }

  const plugged = cablesFor(rig, slot).filter((c) => c.connected);
  if (plugged.length) return `Disconnect ${plugged[0].label} first`;

  return null;
}

export function canRemove(rig: Rig, slotId: string): boolean {
  return blockedReason(rig, slotId) === null;
}

/** A part only goes in if the slot is empty and the kinds agree. */
export function canInsert(rig: Rig, slotId: string, part: Part): boolean {
  const slot = slotById(rig, slotId);
  return !!slot && !slot.part && slot.kind === part.kind;
}

// ── Transitions ─────────────────────────────────────────────────────────────
//
// Every one returns a NEW rig and refuses illegal moves by returning the input
// unchanged. Refusing rather than throwing keeps the store's job trivial and
// means a mis-wired view degrades to "nothing happened" instead of a crash.

function mapSlot(rig: Rig, slotId: string, f: (s: Slot) => Slot): Rig {
  return { ...rig, slots: rig.slots.map((s) => (s.id === slotId ? f(s) : s)) };
}

/** Drive or undo one screw / open or close one clip. */
export function setFastener(rig: Rig, slotId: string, fastenerId: string, fastened: boolean): Rig {
  return mapSlot(rig, slotId, (s) => ({
    ...s,
    fasteners: s.fasteners.map((f) => (f.id === fastenerId ? { ...f, fastened } : f)),
  }));
}

export function toggleFastener(rig: Rig, slotId: string, fastenerId: string): Rig {
  const slot = slotById(rig, slotId);
  const cur = slot?.fasteners.find((f) => f.id === fastenerId);
  if (!cur) return rig;
  /*
   * A clip cannot be closed over an empty slot. Real latches physically can,
   * but allowing it here lets a learner "finish the job" on a slot with no
   * stick in it and be told the repair is complete — the one outcome this
   * exercise must never produce.
   */
  if (!cur.fastened && !slot?.part) return rig;
  return setFastener(rig, slotId, fastenerId, !cur.fastened);
}

export function setCable(rig: Rig, cableId: string, connected: boolean): Rig {
  return { ...rig, cables: rig.cables.map((c) => (c.id === cableId ? { ...c, connected } : c)) };
}

/**
 * Take the part out and put it on the bench.
 *
 * Gated on `canRemove`, which is the whole point — this is where "unscrew
 * before you pull" stops being advice and becomes a rule.
 */
export function removePart(rig: Rig, slotId: string): Rig {
  if (!canRemove(rig, slotId)) return rig;
  const slot = slotById(rig, slotId);
  if (!slot?.part) return rig;
  const part = slot.part;
  return {
    ...mapSlot(rig, slotId, (s) => ({ ...s, part: null })),
    tray: [...rig.tray, part],
  };
}

export function insertPart(rig: Rig, slotId: string, partId: string): Rig {
  const part = rig.tray.find((p) => p.id === partId);
  if (!part || !canInsert(rig, slotId, part)) return rig;
  return {
    ...mapSlot(rig, slotId, (s) => ({ ...s, part })),
    tray: rig.tray.filter((p) => p.id !== partId),
  };
}

// ── POST ────────────────────────────────────────────────────────────────────

export interface PostResult {
  /** Does the machine come up? */
  boots: boolean;
  /** Beep-code style diagnosis, most important first. */
  faults: string[];
  /** What still needs doing before it will boot, in the operator's words. */
  advice: string | null;
}

/**
 * Power-on self test, derived from the board as it currently stands.
 *
 * Nothing about the outcome is stored: change a clip and the next POST reflects
 * it. That is what makes the scenario gradeable without a separate "is the
 * repair finished" flag that could disagree with the hardware.
 */
export function post(rig: Rig): PostResult {
  const faults: string[] = [];

  for (const slot of rig.slots) {
    if (slot.required && !slot.part) {
      faults.push(`${slot.label} is empty`);
      continue;
    }
    if (!slot.part) continue;

    // A seated part that is not secured is a fault, not a warning: an unclipped
    // stick and an unscrewed cooler both fail in the field, just later.
    const loose = slot.fasteners.filter((f) => !f.fastened);
    if (loose.length) faults.push(`${slot.label}: ${loose[0].label} is not secured`);

    if (slot.part.faulty) faults.push(`${slot.label}: ${slot.part.model} failed self-test`);
  }

  for (const c of rig.cables) {
    if (!c.connected) faults.push(`${c.label} is disconnected`);
  }

  return {
    boots: faults.length === 0,
    faults,
    advice: faults.length ? faults[0] : null,
  };
}

/**
 * The next thing to touch.
 *
 * Drives the UI's highlight. Derived from the board rather than scripted as a
 * step list, so a learner who does things out of order — or fixes something the
 * scenario did not ask about — still gets a sensible next instruction instead
 * of a tutorial that has lost its place.
 */
export function nextAction(rig: Rig): { slotId: string; hint: string } | null {
  // A faulty part must come out before anything else is worth doing.
  for (const slot of rig.slots) {
    if (!slot.part?.faulty) continue;
    const why = blockedReason(rig, slot.id);
    return {
      slotId: slot.id,
      hint: why ?? `Remove the failed ${slot.part.model} from ${slot.label}`,
    };
  }
  // Then fill anything required and empty.
  for (const slot of rig.slots) {
    if (slot.required && !slot.part) return { slotId: slot.id, hint: `Fit a part into ${slot.label}` };
  }
  // Then secure whatever is seated but loose.
  for (const slot of rig.slots) {
    if (!slot.part) continue;
    const loose = slot.fasteners.find((f) => !f.fastened);
    if (loose) return { slotId: slot.id, hint: `Close ${loose.label} on ${slot.label}` };
  }
  // Then re-seat any cable left hanging.
  const open = rig.cables.find((c) => !c.connected);
  if (open) {
    const slot = rig.slots.find((s) => s.cableIds.includes(open.id));
    return { slotId: slot?.id ?? "", hint: `Reconnect ${open.label}` };
  }
  return null;
}

// ── Scenario ────────────────────────────────────────────────────────────────

/**
 * A standard ATX desktop, built and closed up.
 *
 * `fault` decides what is wrong with it. The board is otherwise identical in
 * every scenario, so a learner who has seen one recognises the next — which is
 * the entire argument for a fixed board layout over a procedural one.
 */
export type RigFault = "faulty-ram" | "cpu-fan-unplugged" | "none";

export function buildDesktopRig(fault: RigFault = "faulty-ram"): Rig {
  const clip = (id: string, label: string): Fastener => ({ id, label, kind: "clip", fastened: true });
  const screw = (id: string, label: string): Fastener => ({ id, label, kind: "screw", fastened: true });

  const slots: Slot[] = [
    {
      id: "cpu",
      kind: "cpu",
      label: "CPU socket",
      x: 3, y: 1, w: 4, h: 4,
      part: { id: "p-cpu", kind: "cpu", model: "Xenon X6-4400" },
      fasteners: [screw("cpu-lever", "the retention lever")],
      cableIds: [],
      required: true,
    },
    {
      id: "fan",
      kind: "fan",
      label: "CPU cooler",
      x: 8, y: 1, w: 3, h: 3,
      part: { id: "p-fan", kind: "fan", model: "AeroCore 120" },
      fasteners: [screw("fan-s1", "mounting screw A"), screw("fan-s2", "mounting screw B")],
      cableIds: ["c-fan"],
    },
    {
      id: "ram-a1",
      kind: "ram",
      label: "DIMM A1",
      x: 12, y: 1, w: 1.4, h: 6,
      part: {
        id: "p-ram1",
        kind: "ram",
        model: "8GB DDR4-3200",
        faulty: fault === "faulty-ram",
      },
      fasteners: [clip("a1-top", "the upper clip"), clip("a1-bot", "the lower clip")],
      cableIds: [],
      required: true,
    },
    {
      id: "ram-a2",
      kind: "ram",
      label: "DIMM A2",
      x: 14, y: 1, w: 1.4, h: 6,
      part: { id: "p-ram2", kind: "ram", model: "8GB DDR4-3200" },
      fasteners: [clip("a2-top", "the upper clip"), clip("a2-bot", "the lower clip")],
      cableIds: [],
    },
    {
      id: "pcie-x16",
      kind: "gpu",
      label: "PCIe x16",
      x: 2, y: 8, w: 11, h: 2,
      part: { id: "p-gpu", kind: "gpu", model: "Lumen RTX-3060" },
      fasteners: [screw("gpu-bracket", "the bracket screw"), clip("gpu-latch", "the slot latch")],
      cableIds: ["c-gpu-pwr"],
    },
    {
      id: "sata-0",
      kind: "storage",
      label: "SATA 0",
      x: 15, y: 9, w: 2, h: 1.4,
      part: { id: "p-ssd", kind: "storage", model: "480GB SSD" },
      fasteners: [],
      cableIds: ["c-sata", "c-ssd-pwr"],
    },
    {
      id: "atx",
      kind: "psu",
      label: "ATX power",
      x: 16, y: 1, w: 1.6, h: 5,
      part: { id: "p-psu", kind: "psu", model: "550W Bronze" },
      fasteners: [clip("atx-latch", "the connector latch")],
      cableIds: ["c-atx"],
      required: true,
    },
  ];

  const cables: Cable[] = [
    {
      id: "c-fan",
      label: "the CPU fan header",
      kind: "power",
      from: "fan",
      to: "cpu-fan-header",
      connected: fault !== "cpu-fan-unplugged",
    },
    { id: "c-atx", label: "the 24-pin ATX lead", kind: "power", from: "psu", to: "atx", connected: true },
    { id: "c-gpu-pwr", label: "the PCIe power lead", kind: "power", from: "psu", to: "pcie-x16", connected: true },
    { id: "c-sata", label: "the SATA data cable", kind: "data", from: "sata-0", to: "p-ssd", connected: true },
    { id: "c-ssd-pwr", label: "the SATA power lead", kind: "power", from: "psu", to: "p-ssd", connected: true },
  ];

  return {
    slots,
    cables,
    // The replacement stick is already on the bench: this scenario is about the
    // procedure, not about a parts requisition.
    tray: fault === "faulty-ram" ? [{ id: "p-ram-new", kind: "ram", model: "8GB DDR4-3200" }] : [],
  };
}
