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
  /**
   * Screws are driven, clips and ZIF latches are closed, a caddy handle is
   * seated — `true` always means "this is still holding the part".
   *
   * ZIF is its own kind rather than a clip because the failure mode differs and
   * the lab has to teach it: a clip resists you, a ZIF latch does not, so
   * pulling a ribbon against a closed ZIF tears the cable rather than being
   * merely difficult. The UI reads `kind` to say so.
   */
  kind: "screw" | "clip" | "zif" | "handle";
  fastened: boolean;
}

export interface Cable {
  id: string;
  label: string;
  kind: "power" | "data" | "ribbon";
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
    /*
     * Ordered by what would break first if ignored. A ZIF latch outranks
     * everything: pulling a ribbon against a closed latch tears the cable,
     * which is unrecoverable, where forcing a clip is merely rough.
     */
    const zif = held.find((f) => f.kind === "zif");
    if (zif) return `Flip up ${zif.label} before pulling the ribbon`;
    const handle = held.find((f) => f.kind === "handle");
    if (handle) return `Pull ${handle.label} to release the caddy`;
    const clips = held.filter((f) => f.kind === "clip");
    if (clips.length) return `Release ${clips.length === 1 ? "the clip" : "both clips"} first`;
    const screws = held.filter((f) => f.kind === "screw");
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
export type RigFault = "faulty-ram" | "cpu-fan-unplugged" | "none" | "bare-build";

export function buildDesktopRig(fault: RigFault = "faulty-ram"): Rig {
  const clip = (id: string, label: string): Fastener => ({ id, label, kind: "clip", fastened: true });
  const screw = (id: string, label: string): Fastener => ({ id, label, kind: "screw", fastened: true });
  /**
   * One DIMM in the bank. Only the x offset differs.
   *
   * Fastener ids are passed in rather than generated from the slot id: they are
   * part of the model's identity, referenced by scenarios and by the spec, and
   * silently renaming them while moving a slot across the board would be a
   * behaviour change wearing a layout change's clothes.
   */
  const ramSlot = (
    id: string,
    label: string,
    x: number,
    fastenerIds: [string, string],
    part: Part | null,
    required = false,
  ): Slot => ({
    id, kind: "ram", label, x, y: 1.4, w: 0.72, h: 5.6,
    part,
    fasteners: [clip(fastenerIds[0], "the upper clip"), clip(fastenerIds[1], "the lower clip")],
    cableIds: [],
    required,
  });

  /*
   * Standard ATX, laid out the way the form factor actually specifies:
   * I/O cluster top-left, socket top-centre, DIMMs in a vertical bank to the
   * right of the socket, 24-pin on the far right edge, expansion slots filling
   * the bottom-left quadrant. Anyone who has built a PC should be able to point
   * at this and name every area without reading a label.
   */
  const slots: Slot[] = [
    {
      id: "cpu",
      kind: "cpu",
      label: "CPU socket",
      x: 5.6, y: 1.6, w: 4.6, h: 4.6,
      part: { id: "p-cpu", kind: "cpu", model: "Xenon X6-4400" },
      fasteners: [screw("cpu-lever", "the retention lever")],
      cableIds: [],
      required: true,
    },
    {
      id: "fan",
      kind: "fan",
      label: "CPU cooler",
      // Left of the socket, where a tower cooler's fan hangs.
      x: 1.1, y: 2.2, w: 3.6, h: 3.6,
      part: { id: "p-fan", kind: "fan", model: "AeroCore 120" },
      fasteners: [screw("fan-s1", "mounting screw A"), screw("fan-s2", "mounting screw B")],
      cableIds: ["c-fan"],
    },
    // Four DIMMs in a bank right of the socket. Two populated: the standard
    // dual-channel build, and the reason there is somewhere to add memory.
    ramSlot("ram-a1", "DIMM A1", 11.6, ["a1-top", "a1-bot"], { id: "p-ram1", kind: "ram", model: "8GB DDR4-3200", faulty: fault === "faulty-ram" }, true),
    ramSlot("ram-a2", "DIMM A2", 12.6, ["a2-top", "a2-bot"], { id: "p-ram2", kind: "ram", model: "8GB DDR4-3200" }),
    ramSlot("ram-b1", "DIMM B1", 13.6, ["b1-top", "b1-bot"], null),
    ramSlot("ram-b2", "DIMM B2", 14.6, ["b2-top", "b2-bot"], null),
    {
      id: "atx",
      kind: "psu",
      label: "ATX 24-pin",
      // Far right edge, as the spec puts it.
      x: 18.2, y: 1.4, w: 1.3, h: 5.2,
      part: { id: "p-psu", kind: "psu", model: "550W Bronze" },
      fasteners: [clip("atx-latch", "the connector latch")],
      cableIds: ["c-atx"],
      required: true,
    },
    {
      id: "pcie-x16",
      kind: "gpu",
      label: "PCIe x16",
      // Bottom-left quadrant, horizontal, as expansion cards sit.
      x: 0.9, y: 8.6, w: 12.4, h: 2.1,
      part: { id: "p-gpu", kind: "gpu", model: "Lumen RTX-3060" },
      fasteners: [screw("gpu-bracket", "the bracket screw"), clip("gpu-latch", "the slot latch")],
      cableIds: ["c-gpu-pwr"],
    },
    {
      id: "sata-0",
      kind: "storage",
      label: "SATA 0",
      x: 16.6, y: 8.2, w: 2.6, h: 1.7,
      part: { id: "p-ssd", kind: "storage", model: "480GB SSD" },
      fasteners: [],
      cableIds: ["c-sata", "c-ssd-pwr"],
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

// ── Topologies ──────────────────────────────────────────────────────────────

export type MachineKind = "desktop" | "laptop" | "server";

/**
 * A laptop, opened from the underside.
 *
 * The mechanic that matters here is the ZIF connector: the display and keyboard
 * hang off flex cables that are held by a latch you flip UP before the ribbon
 * slides out. It is the single most commonly destroyed thing in laptop repair,
 * because the ribbon comes away under a closed latch if you pull hard enough —
 * and then the part is scrap. So the model refuses, and names the latch.
 */
export function buildLaptopRig(fault: RigFault = "faulty-ram"): Rig {
  const zif = (id: string, label: string): Fastener => ({ id, label, kind: "zif", fastened: true });
  const screw = (id: string, label: string): Fastener => ({ id, label, kind: "screw", fastened: true });
  const clip = (id: string, label: string): Fastener => ({ id, label, kind: "clip", fastened: true });

  /*
   * A gaming-chassis interior, NOT a small ATX board.
   *
   * The layout is dictated by the case, not by a form-factor spec: the battery
   * owns the entire lower half, dual blowers sit in the top corners exhausting
   * out the hinge, and the board threads between them. Everything else gets
   * tucked into whatever is left — which is exactly why laptop repair is a
   * disassembly ORDER problem rather than a "reach in and swap it" problem.
   */
  const slots: Slot[] = [
    {
      // Top-left blower.
      id: "fan", kind: "fan", label: "Blower L", x: 0.8, y: 0.8, w: 3.6, h: 3.2,
      part: { id: "l-fan", kind: "fan", model: "Thin blower" },
      fasteners: [screw("lfan-s", "the fan screw")],
      cableIds: ["lc-fan"],
    },
    {
      // Top-right blower.
      id: "fan2", kind: "fan", label: "Blower R", x: 15.6, y: 0.8, w: 3.6, h: 3.2,
      part: { id: "l-fan2", kind: "fan", model: "Thin blower" },
      fasteners: [screw("lfan2-s", "the fan screw")],
      cableIds: ["lc-fan2"],
    },
    {
      // Central SoC, between the two blowers and under the heat pipes.
      id: "cpu", kind: "cpu", label: "SoC (soldered)", x: 8.1, y: 1.4, w: 3.8, h: 3.4,
      part: { id: "l-cpu", kind: "cpu", model: "Core M7-1250U" },
      fasteners: [], cableIds: [], required: true,
    },
    {
      // SO-DIMMs stack flat, tucked right of the SoC under a shield.
      id: "ram-so", kind: "ram", label: "SO-DIMM 0", x: 12.4, y: 1.5, w: 2.8, h: 1.2,
      part: { id: "l-ram", kind: "ram", model: "16GB DDR5-4800", faulty: fault === "faulty-ram" },
      fasteners: [clip("so-l", "the left clip"), clip("so-r", "the right clip")],
      cableIds: [], required: true,
    },
    {
      id: "ram-so2", kind: "ram", label: "SO-DIMM 1", x: 12.4, y: 3.1, w: 2.8, h: 1.2,
      part: null,
      fasteners: [clip("so2-l", "the left clip"), clip("so2-r", "the right clip")],
      cableIds: [],
    },
    {
      // M.2 tucked into the narrow strip left of the SoC.
      id: "m2", kind: "storage", label: "M.2 2280", x: 4.9, y: 1.6, w: 2.6, h: 0.9,
      part: { id: "l-ssd", kind: "storage", model: "1TB NVMe" },
      fasteners: [screw("m2-screw", "the retention screw")],
      cableIds: [],
    },
    {
      // Display flex leaves the board toward the hinge, top edge.
      id: "display", kind: "gpu", label: "Display flex", x: 8.4, y: 5.3, w: 3.2, h: 0.9,
      part: { id: "l-disp", kind: "gpu", model: "eDP display panel" },
      fasteners: [zif("zif-disp", "the display ZIF latch")],
      cableIds: ["lc-disp"],
    },
    {
      // The battery owns the entire lower section.
      id: "battery", kind: "psu", label: "Battery pack", x: 1.6, y: 7.4, w: 16.8, h: 4.2,
      part: { id: "l-bat", kind: "psu", model: "58Wh Li-ion" },
      fasteners: [screw("bat-s1", "battery screw A"), screw("bat-s2", "battery screw B")],
      cableIds: ["lc-bat"], required: true,
    },
    {
      // Keyboard/trackpad flex sits BELOW the board and crosses the battery.
      id: "keyboard", kind: "gpu", label: "Keyboard flex", x: 6.4, y: 6.1, w: 7.2, h: 0.9,
      part: { id: "l-kbd", kind: "gpu", model: "Keyboard matrix" },
      fasteners: [zif("zif-kbd", "the keyboard ZIF latch")],
      cableIds: ["lc-kbd"],
    },
  ];

  const cables: Cable[] = [
    { id: "lc-disp", label: "the display ribbon", kind: "ribbon", from: "display", to: "cpu", connected: true },
    { id: "lc-kbd", label: "the keyboard ribbon", kind: "ribbon", from: "keyboard", to: "cpu", connected: true },
    { id: "lc-bat", label: "the battery connector", kind: "power", from: "battery", to: "cpu", connected: true },
    {
      id: "lc-fan", label: "the left fan connector", kind: "power", from: "fan", to: "cpu",
      connected: fault !== "cpu-fan-unplugged",
    },
    { id: "lc-fan2", label: "the right fan connector", kind: "power", from: "fan2", to: "cpu", connected: true },
  ];

  return {
    slots, cables,
    tray: fault === "faulty-ram" ? [{ id: "l-ram-new", kind: "ram", model: "16GB DDR5-4800" }] : [],
  };
}

/**
 * A 2U rack server, lid off.
 *
 * Two sockets and four ECC banks, because the population RULES are the lesson:
 * a second CPU's memory banks are dead without that CPU, and DIMMs go in
 * matched pairs from the first slot outward. The drive bays are hot-swap, which
 * is the other half — a caddy comes out under power once the handle is pulled,
 * and that is exactly why a server drive swap is not a teardown at all.
 */
export function buildServerRig(fault: RigFault = "faulty-ram"): Rig {
  const screw = (id: string, label: string): Fastener => ({ id, label, kind: "screw", fastened: true });
  const clip = (id: string, label: string): Fastener => ({ id, label, kind: "clip", fastened: true });
  const handle = (id: string, label: string): Fastener => ({ id, label, kind: "handle", fastened: true });

  /*
   * SSI EEB, laid out the way a dual-socket board actually is.
   *
   * The sockets sit side by side across the middle, and each is FLANKED by its
   * own memory — four channels to the left, four to the right. That adjacency
   * is not decoration: a DIMM is wired to one specific socket's controller, so
   * the bank beside CPU 1 is dead if CPU 1 is not fitted, and populating "the
   * next free slot" without knowing which side you are on is a real and common
   * mistake. Expansion sits along the bottom edge, drives at the front.
   */
  const bank = (id: string, label: string, x: number, part: Part | null, required = false): Slot => ({
    id, kind: "ram", label, x, y: 3.2, w: 0.62, h: 5.4,
    part,
    fasteners: [clip(`${id}-t`, "the upper clip"), clip(`${id}-b`, "the lower clip")],
    cableIds: [],
    required,
  });

  const bay = (n: number, y: number): Slot => ({
    id: `bay-${n}`, kind: "storage", label: `Bay ${n}`, x: 0.7, y, w: 2.6, h: 1.5,
    part: { id: `s-hdd${n}`, kind: "storage", model: "2TB SAS 10K" },
    // A hot-swap caddy is held by ONE thing: the handle. No cables, because the
    // backplane is the connector — which is the entire point of hot-swap.
    fasteners: [handle(`bay${n}-h`, `the bay ${n} handle`)],
    cableIds: [],
  });

  /** Eight DIMMs per socket: four either side, as the channels are wired. */
  const flank = (cpu: 0 | 1, originX: number, populated: number, faultyFirst: boolean): Slot[] => {
    const out: Slot[] = [];
    for (let i = 0; i < 8; i++) {
      // Four to the left of the socket, four to the right.
      const side = i < 4 ? i : i + 4.9;
      const n = cpu * 8 + i + 1;
      const filled = i < populated;
      out.push(
        bank(
          `dimm-${n}`,
          `${cpu}${String.fromCharCode(65 + i)}`,
          originX + side * 0.76,
          filled
            ? { id: `s-ram${n}`, kind: "ram", model: "32GB ECC RDIMM", faulty: faultyFirst && i === 0 }
            : null,
          n === 1,
        ),
      );
    }
    return out;
  };

  const slots: Slot[] = [
    {
      id: "cpu0", kind: "cpu", label: "CPU 0", x: 6.5, y: 3.6, w: 3.4, h: 3.4,
      part: { id: "s-cpu0", kind: "cpu", model: "Xenon Gold 6338" },
      fasteners: [screw("c0-a", "ILM screw A"), screw("c0-b", "ILM screw B")],
      cableIds: [], required: true,
    },
    {
      id: "cpu1", kind: "cpu", label: "CPU 1", x: 14.6, y: 3.6, w: 3.4, h: 3.4,
      part: { id: "s-cpu1", kind: "cpu", model: "Xenon Gold 6338" },
      fasteners: [screw("c1-a", "ILM screw A"), screw("c1-b", "ILM screw B")],
      cableIds: [],
    },
    ...flank(0, 3.6, 2, fault === "faulty-ram"),
    ...flank(1, 11.7, 2, false),
    {
      id: "psu0", kind: "psu", label: "PSU 0", x: 20.4, y: 0.8, w: 2.6, h: 2.4,
      part: { id: "s-psu0", kind: "psu", model: "800W redundant" },
      fasteners: [handle("psu0-h", "the PSU 0 handle")],
      cableIds: ["sc-psu0"], required: true,
    },
    {
      id: "psu1", kind: "psu", label: "PSU 1", x: 20.4, y: 3.6, w: 2.6, h: 2.4,
      part: { id: "s-psu1", kind: "psu", model: "800W redundant" },
      fasteners: [handle("psu1-h", "the PSU 1 handle")],
      cableIds: ["sc-psu1"],
    },
    bay(0, 0.8), bay(1, 2.6), bay(2, 4.4), bay(3, 6.2),
    {
      id: "fan", kind: "fan", label: "Fan wall", x: 4.2, y: 0.7, w: 13.6, h: 2.1,
      part: { id: "s-fan", kind: "fan", model: "6x 60mm hot-swap" },
      fasteners: [],
      cableIds: ["sc-fan"],
    },
    {
      // Expansion along the very bottom edge, as risers sit on an EEB board.
      id: "pcie-0", kind: "gpu", label: "PCIe x16 riser", x: 4.2, y: 9.4, w: 12.2, h: 1.5,
      part: { id: "s-nic", kind: "gpu", model: "Dual 25GbE NIC" },
      fasteners: [screw("pcie0-s", "the riser screw")],
      cableIds: [],
    },
  ];

  const cables: Cable[] = [
    { id: "sc-psu0", label: "the PSU 0 feed", kind: "power", from: "psu0", to: "backplane", connected: true },
    { id: "sc-psu1", label: "the PSU 1 feed", kind: "power", from: "psu1", to: "backplane", connected: true },
    {
      id: "sc-fan", label: "the fan wall header", kind: "power", from: "fan", to: "cpu0",
      connected: fault !== "cpu-fan-unplugged",
    },
  ];

  return {
    slots, cables,
    tray: fault === "faulty-ram" ? [{ id: "s-ram-new", kind: "ram", model: "32GB ECC RDIMM" }] : [],
  };
}

export function buildRig(kind: MachineKind, fault: RigFault = "faulty-ram"): Rig {
  // A bare build is the SAME machine with everything taken back out. Deriving
  // it rather than authoring a fourth set of slots means the assembly bench and
  // the repair bench can never disagree about what a machine is made of.
  if (fault === "bare-build") return stripToWorkbench(buildRig(kind, "none"));
  if (kind === "laptop") return buildLaptopRig(fault);
  if (kind === "server") return buildServerRig(fault);
  return buildDesktopRig(fault);
}

/**
 * Empty the machine onto the workbench.
 *
 * Every fitted part goes to the tray, every fastener opens and every cable
 * comes off — the state a chassis actually arrives in. Because `post` and
 * `nextAction` are derived, the assembly job grades itself from here with no
 * separate "build mode" logic: the same rules that refuse to let you pull a
 * clipped DIMM refuse to let you call an unclipped one finished.
 */
export function stripToWorkbench(rig: Rig): Rig {
  const pulled: Part[] = [];
  const slots = rig.slots.map((s) => {
    if (s.part) pulled.push(s.part);
    return {
      ...s,
      part: null,
      fasteners: s.fasteners.map((f) => ({ ...f, fastened: false })),
    };
  });
  return {
    slots,
    cables: rig.cables.map((c) => ({ ...c, connected: false })),
    tray: [...rig.tray, ...pulled],
  };
}

// ── POST codes and BIOS ─────────────────────────────────────────────────────

/**
 * A POST halt, in the voice the firmware actually uses.
 *
 * Beep codes are paired with the on-screen text because a technician meets both
 * — the beeps when there is no display yet, the text when there is. Teaching
 * only the string would leave someone helpless in front of a machine that
 * cannot draw anything.
 */
export interface PostHalt {
  code: string;
  beeps: string;
  screen: string;
}

export function postHalt(rig: Rig): PostHalt | null {
  const cpu = rig.slots.find((s) => s.kind === "cpu" && s.required);
  if (cpu && !cpu.part) {
    return { code: "0x00", beeps: "continuous", screen: "No processor installed — system halted" };
  }
  const ram = rig.slots.filter((s) => s.kind === "ram");
  const goodRam = ram.filter((s) => s.part && !s.part.faulty && s.fasteners.every((f) => f.fastened));
  if (ram.length && goodRam.length === 0) {
    // The classic. One long, two short is the memory code every technician
    // learns first, and it fires whether the stick is missing OR dead.
    return { code: "0x53", beeps: "1 long, 2 short", screen: "Memory not detected — check DIMM seating" };
  }
  const fanCable = rig.cables.find((c) => c.id.includes("fan"));
  if (fanCable && !fanCable.connected) {
    return { code: "0x5A", beeps: "none", screen: "CPU Fan Error. Press F1 to Run SETUP" };
  }
  const loose = rig.slots.find((s) => s.part && s.fasteners.some((f) => !f.fastened));
  if (loose) {
    return { code: "0x62", beeps: "3 short", screen: `${loose.label} not secured — reseat and retry` };
  }
  const power = rig.cables.find((c) => c.kind === "power" && !c.connected);
  if (power) {
    return { code: "0x10", beeps: "continuous", screen: `Power fault — ${power.label} is disconnected` };
  }
  return null;
}

export type BootDeviceKind = "disk" | "usb" | "network";

export interface BootDevice {
  id: string;
  label: string;
  kind: BootDeviceKind;
  /** A blank disk cannot boot — that is why the USB installer exists. */
  bootable: boolean;
}

export interface BiosSettings {
  /** First entry wins. Order IS the setting — no separate priority field. */
  bootOrder: BootDevice[];
  virtualization: boolean;
  secureBoot: boolean;
}

/** Boot devices DERIVED from what is actually fitted, plus the bench USB. */
export function biosDevices(rig: Rig, osInstalled: boolean): BootDevice[] {
  const disks = rig.slots
    .filter((s) => s.kind === "storage" && s.part)
    .map((s) => ({
      id: s.id,
      label: `${s.part?.model ?? "disk"} (${s.label})`,
      kind: "disk" as const,
      bootable: osInstalled,
    }));
  return [
    ...disks,
    { id: "usb", label: "USB — DeskOS Setup", kind: "usb", bootable: true },
    { id: "pxe", label: "Network boot (PXE)", kind: "network", bootable: false },
  ];
}

export function defaultBios(rig: Rig, osInstalled: boolean): BiosSettings {
  const devices = biosDevices(rig, osInstalled);
  return { bootOrder: devices, virtualization: true, secureBoot: true };
}

export function moveBootDevice(s: BiosSettings, id: string, dir: "up" | "down"): BiosSettings {
  const at = s.bootOrder.findIndex((d) => d.id === id);
  const to = dir === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= s.bootOrder.length) return s;
  const next = [...s.bootOrder];
  next.splice(at, 1);
  next.splice(to, 0, s.bootOrder[at]);
  return { ...s, bootOrder: next };
}

/**
 * What the machine does when the firmware hands off.
 *
 * The first BOOTABLE device wins, not simply the first — a disk at the top of
 * the order with nothing installed on it falls through, which is exactly why
 * "it boots to the installer every time" is a real complaint and why the fix is
 * to change the order rather than to reinstall.
 */
export function resolveBoot(s: BiosSettings): BootDevice | null {
  return s.bootOrder.find((d) => d.bootable) ?? null;
}

/** Specs the OS layer needs, read off the hardware rather than typed in twice. */
export interface RigSpec {
  cpuModel: string;
  cores: number;
  ramGb: number;
  diskGb: number;
}

export function rigSpec(rig: Rig): RigSpec {
  const cpus = rig.slots.filter((s) => s.kind === "cpu" && s.part);
  const ram = rig.slots.filter((s) => s.kind === "ram" && s.part && !s.part.faulty);
  const disks = rig.slots.filter((s) => s.kind === "storage" && s.part);
  const gbOf = (model: string) => {
    const m = model.match(/(\d+)\s*(GB|TB)/i);
    if (!m) return 0;
    return Number(m[1]) * (m[2].toUpperCase() === "TB" ? 1024 : 1);
  };
  return {
    cpuModel: cpus[0]?.part?.model ?? "unknown",
    // Two sockets is two physical CPUs; the core count is per-socket and fixed
    // here because the model does not carry one and inventing a number per
    // model string would be a lie dressed as detail.
    cores: cpus.length * 8,
    ramGb: ram.reduce((a, s) => a + gbOf(s.part?.model ?? ""), 0),
    diskGb: disks.reduce((a, s) => a + gbOf(s.part?.model ?? ""), 0),
  };
}

// ── Telemetry ───────────────────────────────────────────────────────────────

/**
 * Live sensor readings, derived from what is actually fitted.
 *
 * A BIOS health page whose numbers are constants teaches nothing: the whole
 * point of a hardware monitor is that it REACTS. So the cooler's presence and
 * its cabling set the CPU temperature, the fan header sets the RPM, and pulling
 * a stick changes the memory total on the same screen. A learner who unplugs a
 * fan and watches the temperature climb has learned what the page is for.
 */
export interface Telemetry {
  cpuTempC: number;
  cpuFanRpm: number;
  memoryMhz: number;
  vcore: number;
  dram: number;
  /** True when a reading is outside its safe band — the BIOS colours these. */
  cpuTempCritical: boolean;
  cpuFanStalled: boolean;
}

export function telemetry(rig: Rig): Telemetry {
  const coolerSlot = rig.slots.find((s) => s.kind === "fan");
  const coolerFitted = !!coolerSlot?.part;
  const coolerSecured = coolerSlot?.fasteners.every((f) => f.fastened) ?? false;
  const fanCable = rig.cables.find((c) => c.id.includes("fan"));
  const fanPowered = coolerFitted && (fanCable?.connected ?? false);

  /*
   * Idle silicon sits around 38C with a working cooler. Remove the cooler and
   * it runs away; fit it but leave it unscrewed and it sits between — a bad
   * mount is a real fault that a temperature reading is exactly how you catch.
   */
  const cpuTempC = !coolerFitted ? 94 : !fanPowered ? 78 : !coolerSecured ? 61 : 38;

  const ram = rig.slots.filter((s) => s.kind === "ram" && s.part && !s.part.faulty);
  const ddr5 = ram.some((s) => /DDR5/.test(s.part?.model ?? ""));

  return {
    cpuTempC,
    cpuFanRpm: fanPowered ? (cpuTempC > 60 ? 2150 : 1180) : 0,
    memoryMhz: ram.length === 0 ? 0 : ddr5 ? 4800 : 3200,
    // Voltages track load rather than being invented per render, so the page
    // is stable to read: a number that jitters every frame cannot be judged.
    vcore: coolerFitted ? 1.24 : 1.31,
    dram: ddr5 ? 1.1 : 1.35,
    cpuTempCritical: cpuTempC >= 75,
    cpuFanStalled: !fanPowered,
  };
}

// ── Provisioning ────────────────────────────────────────────────────────────

/**
 * A device the freshly installed OS does not yet have a driver for.
 *
 * Derived from the hardware, not a fixed list: fit a GPU and the display
 * adapter appears in Device Manager wanting a driver, leave it out and it does
 * not. That is what makes "unknown device" a consequence of the build rather
 * than a scripted step.
 */
export interface PendingDriver {
  id: string;
  device: string;
  hint: string;
}

export function pendingDrivers(rig: Rig, installed: string[]): PendingDriver[] {
  const out: PendingDriver[] = [];
  // The NIC is on the board, so it is always present and always unknown on a
  // fresh image — the classic "no network until you install the driver".
  out.push({ id: "nic", device: "Ethernet Controller", hint: "No network adapter driver present" });
  if (rig.slots.some((s) => s.kind === "gpu" && s.part)) {
    out.push({ id: "vga", device: "Display Adapter", hint: "Running on the basic display driver" });
  }
  if (rig.slots.some((s) => s.kind === "storage" && s.part)) {
    out.push({ id: "sata", device: "Storage Controller", hint: "Generic AHCI driver in use" });
  }
  return out.filter((d) => !installed.includes(d.id));
}

/**
 * Can this machine join a domain yet?
 *
 * The network driver gates it, and that ordering is the lesson: a machine with
 * no working NIC cannot reach a domain controller, so "join the domain" fails
 * for a reason that has nothing to do with the credentials the operator keeps
 * retyping. Returns the reason so the dialog can say it.
 */
export function domainJoinBlocker(installed: string[]): string | null {
  if (!installed.includes("nic")) return "No network adapter driver — this machine cannot reach a domain controller";
  return null;
}
