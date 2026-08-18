/**
 * ITQuest — Desktop build model (pure)
 * ====================================
 * The parts on the desk, the bays they go into, and the order a real build
 * follows. Ground-up replacement for the rig engine, scoped to one desktop.
 *
 * ── LAYOUT IS DATA, IN TWO PLACES ───────────────────────────────────────────
 *
 * Every part carries a `desk` pose (where it lies on the bench, at an angle)
 * and every bay carries a `seat` rect (where it lands inside the case). The
 * animation between them is therefore a pure interpolation the view performs —
 * there is no second set of "installed positions" hiding in a component, which
 * is what made the previous renderer impossible to re-skin.
 *
 * ── SEQUENCE IS DERIVED, NOT SCRIPTED ───────────────────────────────────────
 *
 * `nextStep` walks the build order and returns the first thing not yet done.
 * A step list stored as an index would lose its place the moment somebody
 * worked out of order; deriving it means the guidance is always true, and a
 * player who fits the RAM early is simply further along.
 *
 * Coordinates are in a 0-100 x 0-100 desk space so the view can scale to any
 * viewport without the model knowing what a pixel is.
 */

export type PartId = "mobo" | "cpu" | "paste" | "cooler" | "ram1" | "ram2" | "ssd" | "gpu";

export type CableId = "atx24" | "cpu8" | "pcie8";

/** Where a part lies on the desk before it is fitted. */
export interface DeskPose {
  x: number;
  y: number;
  /** Degrees. The reference scatters parts at angles; axis-aligned looks dead. */
  rot: number;
}

/** Where a part sits once installed, in case-interior space. */
export interface Seat {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

export interface PartDef {
  id: PartId;
  label: string;
  /** Sub-label shown on the desk tag, e.g. capacity or model. */
  spec: string;
  desk: DeskPose;
  seat: Seat;
  /**
   * What must already be installed. The CPU cannot go in before the board is
   * mounted, and the cooler cannot go on before paste — the dependency IS the
   * teaching, so it lives here rather than in a wizard's step counter.
   */
  needs: PartId[];
  /** Cables that only become connectable once this part is seated. */
  powers?: CableId[];
}

/**
 * The build, in the order it is actually performed.
 *
 * Board first because everything mounts to it; paste before cooler because you
 * cannot get to the die afterwards; GPU last because it blocks access to the
 * slots underneath it. Each `needs` is a real physical constraint, not a
 * difficulty gate.
 */
export const PARTS: PartDef[] = [
  {
    id: "mobo",
    label: "Motherboard",
    spec: "ATX B760",
    desk: { x: 50, y: 88, rot: -4 },
    seat: { x: 14, y: 26, w: 46, h: 58 },
    needs: [],
    powers: ["atx24", "cpu8"],
  },
  {
    id: "cpu",
    label: "CPU",
    spec: "6-core LGA",
    desk: { x: 88, y: 15, rot: 12 },
    seat: { x: 33, y: 44, w: 9, h: 9 },
    needs: ["mobo"],
  },
  {
    id: "paste",
    label: "Thermal paste",
    spec: "1g syringe",
    desk: { x: 92, y: 40, rot: -20 },
    // Paste has no footprint of its own — it lands on the die.
    seat: { x: 35.5, y: 46.5, w: 4, h: 4 },
    needs: ["cpu"],
  },
  {
    id: "cooler",
    label: "CPU cooler",
    spec: "92mm top-flow",
    desk: { x: 88, y: 62, rot: 0 },
    seat: { x: 29.5, y: 40.5, w: 16, h: 16 },
    needs: ["paste"],
  },
  {
    id: "ram1",
    label: "RAM (slot A1)",
    spec: "8GB DDR4",
    desk: { x: 10, y: 34, rot: -18 },
    seat: { x: 49, y: 30, w: 2.6, h: 22 },
    needs: ["mobo"],
  },
  {
    id: "ram2",
    label: "RAM (slot A2)",
    spec: "8GB DDR4",
    desk: { x: 8, y: 46, rot: -18 },
    seat: { x: 53, y: 30, w: 2.6, h: 22 },
    needs: ["mobo"],
  },
  {
    id: "ssd",
    label: "M.2 SSD",
    spec: "1TB NVMe",
    desk: { x: 12, y: 20, rot: -22 },
    seat: { x: 20, y: 66, w: 18, h: 3 },
    needs: ["mobo"],
  },
  {
    id: "gpu",
    label: "Graphics card",
    spec: "Dual-fan 8GB",
    desk: { x: 50, y: 74, rot: 0 },
    seat: { x: 16, y: 72, w: 42, h: 12 },
    needs: ["mobo"],
    powers: ["pcie8"],
  },
];

export interface CableDef {
  id: CableId;
  label: string;
  colour: string;
  /** PSU-side origin, in case space. */
  from: { x: number; y: number };
  /** Header the plug lands on. */
  to: { x: number; y: number };
}

/**
 * Cables run from the PSU shroud to their header.
 *
 * Only three, and each one is a real failure mode: no 24-pin and nothing
 * powers on, no 8-pin and the board posts but the CPU never comes up, no PCIe
 * and the card sits dark in a working machine.
 */
export const CABLES: CableDef[] = [
  { id: "atx24", label: "24-pin ATX", colour: "#e0a53f", from: { x: 24, y: 22 }, to: { x: 16, y: 34 } },
  { id: "cpu8", label: "8-pin CPU", colour: "#d4634a", from: { x: 30, y: 20 }, to: { x: 30, y: 28 } },
  { id: "pcie8", label: "8-pin PCIe", colour: "#c9584f", from: { x: 26, y: 24 }, to: { x: 22, y: 74 } },
];

// ── State ───────────────────────────────────────────────────────────────────

export interface BuildState {
  installed: PartId[];
  connected: CableId[];
}

export const EMPTY_BUILD: BuildState = { installed: [], connected: [] };

export function partById(id: PartId): PartDef | undefined {
  return PARTS.find((p) => p.id === id);
}

export function isInstalled(b: BuildState, id: PartId): boolean {
  return b.installed.includes(id);
}

/**
 * Why this part cannot go in yet — or null when it can.
 *
 * The reason, not a boolean, so the UI names the blocking part instead of
 * greying a control out. "Fit the motherboard first" is instruction; a dimmed
 * card is a puzzle.
 */
export function blockedBy(b: BuildState, id: PartId): string | null {
  const def = partById(id);
  if (!def) return "Unknown part";
  if (isInstalled(b, id)) return "Already installed";
  const missing = def.needs.filter((n) => !isInstalled(b, n));
  if (missing.length === 0) return null;
  const names = missing.map((m) => partById(m)?.label ?? m);
  return `Fit the ${names.join(" and ")} first`;
}

export function canInstall(b: BuildState, id: PartId): boolean {
  return blockedBy(b, id) === null;
}

export function install(b: BuildState, id: PartId): BuildState {
  if (!canInstall(b, id)) return b;
  return { ...b, installed: [...b.installed, id] };
}

/** A cable is only connectable once the thing it powers is seated. */
export function cableReady(b: BuildState, id: CableId): boolean {
  const owner = PARTS.find((p) => p.powers?.includes(id));
  return !owner || isInstalled(b, owner.id);
}

export function connect(b: BuildState, id: CableId): BuildState {
  if (!cableReady(b, id) || b.connected.includes(id)) return b;
  return { ...b, connected: [...b.connected, id] };
}

export function reset(): BuildState {
  return { installed: [], connected: [] };
}

// ── Guidance and completion ─────────────────────────────────────────────────

export interface Step {
  kind: "part" | "cable";
  id: string;
  label: string;
}

/** The next thing to do, derived from what is already done. */
export function nextStep(b: BuildState): Step | null {
  for (const p of PARTS) {
    if (!isInstalled(b, p.id)) {
      // Skip anything still blocked; its dependency is earlier in the list and
      // will be returned first anyway.
      if (canInstall(b, p.id)) return { kind: "part", id: p.id, label: `Fit the ${p.label.toLowerCase()}` };
    }
  }
  for (const c of CABLES) {
    if (!b.connected.includes(c.id) && cableReady(b, c.id)) {
      return { kind: "cable", id: c.id, label: `Connect the ${c.label}` };
    }
  }
  return null;
}

export interface BuildReport {
  complete: boolean;
  /** Everything still outstanding, most important first. */
  faults: string[];
  progress: number;
}

/**
 * Is the machine finished, and if not, what is missing?
 *
 * Derived on read, so there is no "is the build done" flag that can disagree
 * with the parts actually fitted.
 */
export function report(b: BuildState): BuildReport {
  const faults: string[] = [];
  for (const p of PARTS) {
    if (!isInstalled(b, p.id)) faults.push(`${p.label} not installed`);
  }
  for (const c of CABLES) {
    if (!b.connected.includes(c.id)) faults.push(`${c.label} not connected`);
  }
  const total = PARTS.length + CABLES.length;
  const done = b.installed.length + b.connected.length;
  return { complete: faults.length === 0, faults, progress: done / total };
}

// ── Telemetry ───────────────────────────────────────────────────────────────

export interface Telemetry {
  cpuTempC: number;
  cpuFanRpm: number;
  memoryMhz: number;
  vcore: number;
  cpuTempCritical: boolean;
  cpuFanStalled: boolean;
}

/**
 * Sensor readings, derived from what is actually built.
 *
 * A hardware monitor whose numbers are constants teaches nothing. Here the
 * cooler's presence sets the temperature and the paste under it sets how well
 * it works — mount a cooler on a bare die and it runs hot, which is a real
 * mistake with a real symptom.
 */
export function telemetry(b: BuildState): Telemetry {
  const cooled = isInstalled(b, "cooler");
  const pasted = isInstalled(b, "paste");
  const cpuTempC = !isInstalled(b, "cpu") ? 0 : !cooled ? 96 : !pasted ? 74 : 38;
  const sticks = (isInstalled(b, "ram1") ? 1 : 0) + (isInstalled(b, "ram2") ? 1 : 0);
  return {
    cpuTempC,
    cpuFanRpm: cooled ? (cpuTempC > 60 ? 2200 : 1150) : 0,
    memoryMhz: sticks ? 3200 : 0,
    vcore: cooled ? 1.24 : 1.31,
    cpuTempCritical: cpuTempC >= 70,
    cpuFanStalled: !cooled,
  };
}

export interface RigSpec {
  cpuModel: string;
  cores: number;
  ramGb: number;
  diskGb: number;
}

/** Specs the OS layer reads. Absent parts genuinely reduce them. */
export function specOf(b: BuildState): RigSpec {
  const sticks = (isInstalled(b, "ram1") ? 1 : 0) + (isInstalled(b, "ram2") ? 1 : 0);
  return {
    cpuModel: isInstalled(b, "cpu") ? "Xenon X6-4400" : "not detected",
    cores: isInstalled(b, "cpu") ? 6 : 0,
    ramGb: sticks * 8,
    diskGb: isInstalled(b, "ssd") ? 1024 : 0,
  };
}

// ── POST ────────────────────────────────────────────────────────────────────

export interface PostHalt {
  code: string;
  beeps: string;
  screen: string;
}

/**
 * Why the machine will not boot, in the firmware's own voice.
 *
 * Beep codes are paired with the on-screen text because a technician meets
 * both — the beeps when there is no display yet. Ordered by what stops the
 * machine soonest.
 */
export function postHalt(b: BuildState): PostHalt | null {
  if (!isInstalled(b, "mobo")) {
    return { code: "—", beeps: "silence", screen: "No motherboard fitted — nothing to power" };
  }
  if (!b.connected.includes("atx24")) {
    return { code: "0x10", beeps: "silence", screen: "No 24-pin ATX power — system will not start" };
  }
  if (!isInstalled(b, "cpu")) {
    return { code: "0x00", beeps: "continuous", screen: "No processor installed — system halted" };
  }
  if (!b.connected.includes("cpu8")) {
    return { code: "0x12", beeps: "continuous", screen: "CPU power (8-pin) not connected" };
  }
  if (!isInstalled(b, "ram1") && !isInstalled(b, "ram2")) {
    return { code: "0x53", beeps: "1 long, 2 short", screen: "Memory not detected — check DIMM seating" };
  }
  if (!isInstalled(b, "cooler")) {
    return { code: "0x5A", beeps: "none", screen: "CPU Fan Error. Press F1 to Run SETUP" };
  }
  return null;
}

// ── BIOS ────────────────────────────────────────────────────────────────────

export type BootDeviceKind = "disk" | "usb" | "network";

export interface BootDevice {
  id: string;
  label: string;
  kind: BootDeviceKind;
  bootable: boolean;
}

export interface BiosSettings {
  bootOrder: BootDevice[];
  virtualization: boolean;
  secureBoot: boolean;
}

/** Devices derived from the build, plus the bench USB. */
export function biosDevices(b: BuildState, osInstalled: boolean): BootDevice[] {
  const out: BootDevice[] = [];
  if (isInstalled(b, "ssd")) {
    out.push({ id: "ssd", label: "1TB NVMe (M.2)", kind: "disk", bootable: osInstalled });
  }
  out.push({ id: "usb", label: "USB — DeskOS Setup", kind: "usb", bootable: true });
  out.push({ id: "pxe", label: "Network boot (PXE)", kind: "network", bootable: false });
  return out;
}

export function defaultBios(b: BuildState, osInstalled: boolean): BiosSettings {
  return { bootOrder: biosDevices(b, osInstalled), virtualization: true, secureBoot: true };
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
 * The first BOOTABLE device wins, not simply the first.
 *
 * A disk at the top with no OS on it falls through to the installer, which is
 * exactly the real "it keeps booting to setup" complaint and its real fix.
 */
export function resolveBoot(s: BiosSettings): BootDevice | null {
  return s.bootOrder.find((d) => d.bootable) ?? null;
}

// ── Provisioning ────────────────────────────────────────────────────────────

export interface PendingDriver {
  id: string;
  device: string;
  hint: string;
}

/** Unknown devices derived from the build — no GPU, no display driver. */
export function pendingDrivers(b: BuildState, installed: string[]): PendingDriver[] {
  const out: PendingDriver[] = [
    { id: "nic", device: "Ethernet Controller", hint: "No network adapter driver present" },
  ];
  if (isInstalled(b, "gpu")) {
    out.push({ id: "vga", device: "Display Adapter", hint: "Running on the basic display driver" });
  }
  if (isInstalled(b, "ssd")) {
    out.push({ id: "nvme", device: "Storage Controller", hint: "Generic NVMe driver in use" });
  }
  return out.filter((d) => !installed.includes(d.id));
}

/**
 * Can this machine join a domain yet?
 *
 * Gated on the network driver, and that ordering is the lesson: a machine with
 * no working NIC cannot reach a domain controller, so the join fails for a
 * reason that has nothing to do with the credentials being retyped.
 */
export function domainJoinBlocker(installed: string[]): string | null {
  if (!installed.includes("nic")) {
    return "No network adapter driver — this machine cannot reach a domain controller";
  }
  return null;
}
