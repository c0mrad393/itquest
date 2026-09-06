/**
 * ITQuest — Bench build model (pure)
 * ===================================
 * What a machine is made of and what state it is in. No React, no store, no
 * geometry: everything here is a function of a `BuildState` and the chassis it
 * belongs to, so the whole build can be reasoned about and tested on bare node.
 *
 * ── ONE MODEL, THREE MACHINES ───────────────────────────────────────────────
 *
 * Part definitions are keyed by id across every chassis and gathered per
 * machine by `partsOf`. A part carries a ROLE — memory, storage, cooling,
 * power — and telemetry, POST and the commissioned spec are derived from those
 * roles rather than from hard-coded ids. That is what lets a server report its
 * memory correctly without anyone teaching this file that `rdimm3` exists.
 *
 * ── BUILDING AND REPAIRING ARE THE SAME MECHANIC ────────────────────────────
 *
 * A build starts from an empty chassis. A repair starts from a populated one
 * with something marked `faulty`. Both finish when every part is present and
 * nothing is faulty, so one engine covers "assemble this workstation" and
 * "replace the failed DIMM in bank B" without a second code path.
 *
 * Disassembly order falls out of the SAME `needs` graph as assembly, reversed:
 * you cannot pull the mainboard while the memory is still in it, because the
 * memory declares that it needs the board. Nothing states the reverse order
 * separately, so the two cannot disagree.
 */

import { CHASSIS, type CableId, type Chassis, type ChassisId, type PartId } from "./chassis";

export type { CableId, ChassisId, PartId };

/**
 * What a part IS, rather than what it is called.
 *
 * Derivations key off this. `memory` is memory whether it is a DIMM in a tower,
 * a SO-DIMM in a notebook or a registered module in a server.
 */
export type PartRole =
  | "board"
  | "cpu"
  | "cooling"
  /** Paste, pads — the layer between a die and its cooler. */
  | "thermal-interface"
  /** Ducting that has to come off before you can reach anything under it. */
  | "shroud"
  | "memory"
  | "storage"
  | "power"
  | "expansion"
  | "network";

export interface PartDef {
  id: PartId;
  label: string;
  /** Sub-label on the desk tag, e.g. capacity or model. */
  spec: string;
  role: PartRole;
  /**
   * What must already be installed. The CPU cannot go in before the board is
   * mounted, and the cooler cannot go on before paste — the dependency IS the
   * teaching, so it lives here rather than in a wizard's step counter.
   */
  needs: PartId[];
  /** Cables that only become connectable once this part is seated. */
  powers?: CableId[];
  /** Capacity this part contributes, for memory and storage. */
  gb?: number;
  /**
   * Changeable with the machine running. True only where it is true: a server
   * drive caddy, and nothing else on any of these three machines.
   */
  hotSwap?: boolean;
  /**
   * Roles this part BRINGS WITH IT because they are soldered to it.
   *
   * A notebook's processor is not a component you fit — it is part of the
   * board. Without saying so, the machine has no cpu-role part at all, and
   * every derivation that asks "is there a processor" answers no forever: a
   * fully assembled laptop reported no CPU, refused to POST, and told the
   * operator to install one that cannot be installed.
   */
  integrates?: PartRole[];
}

// ────────────────────────────────────────────────────────────────────────────
// Part definitions
// ────────────────────────────────────────────────────────────────────────────

export const PART_DEFS: Record<PartId, PartDef> = {
  // ── Desktop ───────────────────────────────────────────────────────────────
  mobo: { id: "mobo", label: "Motherboard", spec: "ATX B760", role: "board", needs: [] },
  /*
   * The PSU mounts in the basement and does not depend on the board — but
   * every power cable originates here, so it has to be fitted before any of
   * them can be routed. That is expressed through the cables, not a `needs`.
   */
  psu: { id: "psu", label: "Power supply", spec: "650W ATX", role: "power", needs: [], powers: ["atx24", "cpu8"] },
  cpu: { id: "cpu", label: "CPU", spec: "6-core LGA", role: "cpu", needs: ["mobo"] },
  paste: { id: "paste", label: "Thermal paste", spec: "1g syringe", role: "thermal-interface", needs: ["cpu"] },
  cooler: { id: "cooler", label: "CPU cooler", spec: "92mm top-flow", role: "cooling", needs: ["paste"] },
  ram1: { id: "ram1", label: "RAM (slot A1)", spec: "8GB DDR5", role: "memory", needs: ["mobo"], gb: 8 },
  ram2: { id: "ram2", label: "RAM (slot A2)", spec: "8GB DDR5", role: "memory", needs: ["mobo", "ram1"], gb: 8 },
  ssd: { id: "ssd", label: "M.2 SSD", spec: "1TB NVMe", role: "storage", needs: ["mobo"], gb: 1024 },
  gpu: { id: "gpu", label: "Graphics card", spec: "Dual-fan 8GB", role: "expansion", needs: ["mobo"], powers: ["pcie8"] },

  // ── Laptop ────────────────────────────────────────────────────────────────
  // The processor is soldered to this board, so the board carries the role.
  lapboard: { id: "lapboard", label: "Mainboard", spec: "14-core mobile", role: "board", needs: [], integrates: ["cpu"] },
  /*
   * The battery goes in LAST and comes out FIRST. It sits over the M.2 bays,
   * so those are declared as its dependency — which means the disassembly
   * order the `needs` graph produces in reverse is the correct safety order
   * without anyone writing that rule down twice.
   */
  battery: { id: "battery", label: "Battery", spec: "58Wh Li-ion", role: "power", needs: ["lapboard", "nvme", "wlan"], powers: ["battconn"] },
  sodimm1: { id: "sodimm1", label: "SO-DIMM A", spec: "8GB DDR5", role: "memory", needs: ["lapboard"], gb: 8 },
  sodimm2: { id: "sodimm2", label: "SO-DIMM B", spec: "8GB DDR5", role: "memory", needs: ["lapboard", "sodimm1"], gb: 8 },
  wlan: { id: "wlan", label: "WLAN card", spec: "M.2 2230 Wi-Fi 6E", role: "network", needs: ["lapboard"] },
  nvme: { id: "nvme", label: "NVMe SSD", spec: "M.2 2280 · 512GB", role: "storage", needs: ["lapboard"], gb: 512 },
  heatpipe: { id: "heatpipe", label: "Heatpipe", spec: "Flat copper", role: "cooling", needs: ["lapboard"] },
  blower: { id: "blower", label: "Blower fan", spec: "60mm centrifugal", role: "cooling", needs: ["lapboard", "heatpipe"], powers: ["fanconn"] },

  // ── Server ────────────────────────────────────────────────────────────────
  srvboard: { id: "srvboard", label: "System board", spec: "Dual-socket EEB", role: "board", needs: [], powers: ["backplane"] },
  cpuA: { id: "cpuA", label: "CPU 0", spec: "24-core", role: "cpu", needs: ["srvboard"] },
  cpuB: { id: "cpuB", label: "CPU 1", spec: "24-core", role: "cpu", needs: ["srvboard"] },
  hsA: { id: "hsA", label: "Heatsink 0", spec: "2U passive", role: "cooling", needs: ["cpuA"] },
  hsB: { id: "hsB", label: "Heatsink 1", spec: "2U passive", role: "cooling", needs: ["cpuB"] },
  /*
   * A memory bank belongs to a SOCKET. Populating bank B with no CPU 1 fitted
   * gives a machine whose memory is simply not there — a real dual-socket
   * fault a single-socket board cannot express.
   */
  rdimm1: { id: "rdimm1", label: "DIMM A0", spec: "32GB RDIMM", role: "memory", needs: ["srvboard", "cpuA"], gb: 32 },
  rdimm2: { id: "rdimm2", label: "DIMM A1", spec: "32GB RDIMM", role: "memory", needs: ["srvboard", "cpuA", "rdimm1"], gb: 32 },
  rdimm3: { id: "rdimm3", label: "DIMM B0", spec: "32GB RDIMM", role: "memory", needs: ["srvboard", "cpuB"], gb: 32 },
  rdimm4: { id: "rdimm4", label: "DIMM B1", spec: "32GB RDIMM", role: "memory", needs: ["srvboard", "cpuB", "rdimm3"], gb: 32 },
  riser: { id: "riser", label: "PCIe riser", spec: "x16 dual-slot", role: "expansion", needs: ["srvboard"] },
  /*
   * Caddies and supplies mount to the CHASSIS, not the board, and neither
   * depends on anything. That is not a shortcut: it is the whole point of a
   * hot-swap bay and a redundant supply.
   */
  bayA: { id: "bayA", label: "Drive 0", spec: "2TB SAS", role: "storage", needs: [], gb: 2048, hotSwap: true },
  bayB: { id: "bayB", label: "Drive 1", spec: "2TB SAS", role: "storage", needs: [], gb: 2048, hotSwap: true },
  psuA: { id: "psuA", label: "PSU 0", spec: "800W redundant", role: "power", needs: [], powers: ["psubus"] },
  psuB: { id: "psuB", label: "PSU 1", spec: "800W redundant", role: "power", needs: [] },
  /** The baffle closes the airflow path and goes on over finished heatsinks. */
  baffle: { id: "baffle", label: "Air baffle", spec: "Moulded duct", role: "shroud", needs: ["hsA", "hsB"] },
};

export interface CableDef {
  id: CableId;
  label: string;
  colour: string;
}

export const CABLE_DEFS: Record<CableId, CableDef> = {
  atx24: { id: "atx24", label: "24-pin ATX", colour: "#e0a53f" },
  cpu8: { id: "cpu8", label: "8-pin CPU", colour: "#d4634a" },
  pcie8: { id: "pcie8", label: "8-pin PCIe", colour: "#c9584f" },
  battconn: { id: "battconn", label: "Battery connector", colour: "#e0a53f" },
  fanconn: { id: "fanconn", label: "Fan header", colour: "#7f8b96" },
  backplane: { id: "backplane", label: "Backplane loom", colour: "#5f8fd0" },
  psubus: { id: "psubus", label: "PSU busbar", colour: "#d4634a" },
};

/** Every part of one machine, in the order it is built. */
export function partsOf(c: Chassis): PartDef[] {
  return c.parts.map((id) => PART_DEFS[id]);
}

export function cablesOf(c: Chassis): CableDef[] {
  return c.cables.map((id) => CABLE_DEFS[id]);
}

export function partById(id: PartId): PartDef | undefined {
  return PART_DEFS[id];
}

// ────────────────────────────────────────────────────────────────────────────
// Build state
// ────────────────────────────────────────────────────────────────────────────

export interface BuildState {
  chassis: ChassisId;
  installed: PartId[];
  connected: CableId[];
  /**
   * Installed, but defective. A repair job starts with entries here; the work
   * is to take them out and fit sound parts. A part re-fitted from stock is
   * never faulty, so the list only ever shrinks through the bench.
   */
  faulty: PartId[];
}

export function emptyBuild(chassis: ChassisId = "desktop"): BuildState {
  return { chassis, installed: [], connected: [], faulty: [] };
}

/** The starting state of a repair: populated, with named parts failed. */
export function populatedBuild(c: Chassis, faulty: PartId[] = []): BuildState {
  return {
    chassis: c.id,
    installed: [...c.parts],
    connected: [...c.cables],
    faulty: faulty.filter((f) => c.parts.includes(f)),
  };
}

export const EMPTY_BUILD: BuildState = emptyBuild("desktop");

export function chassisOfBuild(b: BuildState): Chassis {
  return CHASSIS[b.chassis];
}

export function isInstalled(b: BuildState, id: PartId): boolean {
  return b.installed.includes(id);
}

export function isFaulty(b: BuildState, id: PartId): boolean {
  return b.faulty.includes(id);
}

/**
 * Why this part cannot go in yet — or null when it can.
 *
 * The reason, not a boolean, so the UI names the blocking part instead of
 * greying a control out. "Fit the motherboard first" is instruction; a dimmed
 * card is a puzzle.
 */
export function blockedBy(b: BuildState, id: PartId): string | null {
  const def = PART_DEFS[id];
  if (!def) return "Unknown part";
  if (isInstalled(b, id)) {
    return isFaulty(b, id) ? "Failed — remove it first" : "Already installed";
  }
  const missing = def.needs.filter((n) => !isInstalled(b, n));
  if (missing.length === 0) return null;
  const names = missing.map((m) => PART_DEFS[m]?.label ?? m);
  return `Fit the ${names.join(" and ")} first`;
}

export function canInstall(b: BuildState, id: PartId): boolean {
  return blockedBy(b, id) === null;
}

export function install(b: BuildState, id: PartId): BuildState {
  if (!canInstall(b, id)) return b;
  // A part fitted from stock is sound. This is what makes remove-then-install
  // a repair rather than a shuffle.
  return { ...b, installed: [...b.installed, id], faulty: b.faulty.filter((f) => f !== id) };
}

/**
 * Why this part cannot come out yet — or null when it can.
 *
 * Read off the SAME dependency graph as assembly. Nothing declares a
 * disassembly order, so there is no second ordering to drift out of step with
 * the first.
 */
export function removeBlockedBy(b: BuildState, id: PartId): string | null {
  if (!isInstalled(b, id)) return "Not installed";
  const c = chassisOfBuild(b);
  const holding = partsOf(c)
    .filter((p) => p.needs.includes(id) && isInstalled(b, p.id))
    .map((p) => p.label);
  if (holding.length === 0) return null;
  return `Remove the ${holding.join(" and ")} first`;
}

export function canRemove(b: BuildState, id: PartId): boolean {
  return removeBlockedBy(b, id) === null;
}

export function remove(b: BuildState, id: PartId): BuildState {
  if (!canRemove(b, id)) return b;
  const def = PART_DEFS[id];
  return {
    ...b,
    installed: b.installed.filter((p) => p !== id),
    faulty: b.faulty.filter((f) => f !== id),
    // Pulling a part unplugs whatever it fed.
    connected: b.connected.filter((cb) => !def?.powers?.includes(cb)),
  };
}

/** A cable is only connectable once the thing it powers is seated. */
export function cableReady(b: BuildState, id: CableId): boolean {
  const c = chassisOfBuild(b);
  const owner = partsOf(c).find((p) => p.powers?.includes(id));
  return !owner || isInstalled(b, owner.id);
}

export function connect(b: BuildState, id: CableId): BuildState {
  if (!cableReady(b, id) || b.connected.includes(id)) return b;
  return { ...b, connected: [...b.connected, id] };
}

export function reset(chassis: ChassisId = "desktop"): BuildState {
  return emptyBuild(chassis);
}

// ── Guidance and completion ─────────────────────────────────────────────────

export interface Step {
  kind: "part" | "cable" | "remove";
  id: string;
  label: string;
}

/** The next thing to do, derived from what is already done. */
export function nextStep(b: BuildState): Step | null {
  const c = chassisOfBuild(b);
  // A failed part is the job. Nothing else matters until it is out.
  for (const id of b.faulty) {
    if (canRemove(b, id)) {
      return { kind: "remove", id, label: `Remove the failed ${PART_DEFS[id].label.toLowerCase()}` };
    }
  }
  if (b.faulty.length) {
    // Something is on top of the failed part; clearing that is the next move.
    const blocker = removeBlockedBy(b, b.faulty[0]);
    if (blocker) return { kind: "remove", id: b.faulty[0], label: blocker };
  }
  for (const p of partsOf(c)) {
    if (!isInstalled(b, p.id) && canInstall(b, p.id)) {
      return { kind: "part", id: p.id, label: `Fit the ${p.label.toLowerCase()}` };
    }
  }
  for (const cb of cablesOf(c)) {
    if (!b.connected.includes(cb.id) && cableReady(b, cb.id)) {
      return { kind: "cable", id: cb.id, label: `Connect the ${cb.label}` };
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
  const c = chassisOfBuild(b);
  const faults: string[] = [];
  for (const id of b.faulty) faults.push(`${PART_DEFS[id].label} has failed and is still fitted`);
  for (const p of partsOf(c)) if (!isInstalled(b, p.id)) faults.push(`${p.label} not installed`);
  for (const cb of cablesOf(c)) if (!b.connected.includes(cb.id)) faults.push(`${cb.label} not connected`);

  const total = c.parts.length + c.cables.length;
  const done = b.installed.filter((p) => !b.faulty.includes(p)).length + b.connected.length;
  return { complete: faults.length === 0, faults, progress: total ? done / total : 0 };
}

// ── Role helpers ────────────────────────────────────────────────────────────

/**
 * Installed, sound parts of a given role. A failed part contributes nothing.
 *
 * A part also counts for any role it INTEGRATES, which is how a soldered
 * processor is found on a machine that has no separate CPU to fit.
 */
export function working(b: BuildState, role: PartRole): PartDef[] {
  const c = chassisOfBuild(b);
  return partsOf(c).filter(
    (p) =>
      (p.role === role || p.integrates?.includes(role)) &&
      isInstalled(b, p.id) &&
      !isFaulty(b, p.id),
  );
}

export function hasRole(b: BuildState, role: PartRole): boolean {
  return working(b, role).length > 0;
}

function capacity(b: BuildState, role: PartRole): number {
  return working(b, role).reduce((n, p) => n + (p.gb ?? 0), 0);
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
 * cooler's presence sets the temperature and the interface material under it
 * sets how well it works — mount a cooler on a bare die and it runs hot, which
 * is a real mistake with a real symptom.
 */
export function telemetry(b: BuildState): Telemetry {
  const c = chassisOfBuild(b);
  const cooled = hasRole(b, "cooling");
  // Machines whose coolers ship with a pad have no separate interface part, so
  // "no paste fitted" is not a fault they can have.
  const needsPaste = partsOf(c).some((p) => p.role === "thermal-interface");
  const pasted = !needsPaste || hasRole(b, "thermal-interface");
  const cpuTempC = !hasRole(b, "cpu") ? 0 : !cooled ? 96 : !pasted ? 74 : 38;
  return {
    cpuTempC,
    cpuFanRpm: cooled ? (cpuTempC > 60 ? 2200 : 1150) : 0,
    memoryMhz: hasRole(b, "memory") ? 3200 : 0,
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

/** Specs the OS layer reads. Absent or failed parts genuinely reduce them. */
export function specOf(b: BuildState): RigSpec {
  const cpus = working(b, "cpu");
  const coresEach = b.chassis === "server" ? 24 : b.chassis === "laptop" ? 14 : 6;
  const model =
    b.chassis === "server" ? "Xenon Scalable" : b.chassis === "laptop" ? "Xenon Mobile M14" : "Xenon X6-4400";
  return {
    cpuModel: cpus.length ? model : "not detected",
    cores: cpus.length * coresEach,
    ramGb: capacity(b, "memory"),
    diskGb: capacity(b, "storage"),
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
 *
 * Power is asked as "is anything live", not "is the ATX cable in", because on
 * a server EITHER supply will run the machine. Redundancy that does not
 * actually keep a box alive is decoration.
 */
export function postHalt(b: BuildState): PostHalt | null {
  const c = chassisOfBuild(b);
  const board = partsOf(c).find((p) => p.role === "board");

  if (board && !isInstalled(b, board.id)) {
    return { code: "—", beeps: "silence", screen: `No ${board.label.toLowerCase()} fitted — nothing to power` };
  }
  if (!hasRole(b, "power")) {
    return { code: "0x10", beeps: "silence", screen: "No power source — system will not start" };
  }
  // Every cable a fitted supply is responsible for has to actually be in.
  const powerCables = working(b, "power").flatMap((p) => p.powers ?? []);
  const loose = powerCables.find((id) => !b.connected.includes(id));
  if (loose) {
    return { code: "0x12", beeps: "silence", screen: `${CABLE_DEFS[loose].label} not connected` };
  }
  if (!hasRole(b, "cpu")) {
    return { code: "0x00", beeps: "continuous", screen: "No processor installed — system halted" };
  }
  if (!hasRole(b, "memory")) {
    return { code: "0x53", beeps: "1 long, 2 short", screen: "Memory not detected — check module seating" };
  }
  if (!hasRole(b, "cooling")) {
    return { code: "0x5A", beeps: "none", screen: "Fan Error. Press F1 to Run SETUP" };
  }
  if (b.faulty.length) {
    const f = PART_DEFS[b.faulty[0]];
    return { code: "0xE0", beeps: "2 short", screen: `${f.label} reports a hardware fault — replace it` };
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
  const out: BootDevice[] = working(b, "storage").map((p) => ({
    id: p.id,
    label: `${p.spec} (${p.label})`,
    kind: "disk" as const,
    bootable: osInstalled,
  }));
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
  if (hasRole(b, "expansion")) {
    out.push({ id: "vga", device: "Display Adapter", hint: "Running on the basic display driver" });
  }
  if (hasRole(b, "storage")) {
    out.push({ id: "nvme", device: "Storage Controller", hint: "Generic controller driver in use" });
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

// ── Multimeter ──────────────────────────────────────────────────────────────

export interface RailReading {
  id: CableId;
  label: string;
  /** What the rail should read when the loom is right. */
  nominalV: number;
  /** What the probe actually shows. */
  actualV: number;
  live: boolean;
  /** Plain-language cause when a rail reads dead. */
  note: string;
}

/** Nominal voltage per rail. A battery is not a 12V bus. */
const RAIL_V: Record<CableId, number> = {
  atx24: 3.3, cpu8: 12, pcie8: 12,
  battconn: 11.4, fanconn: 5,
  backplane: 12, psubus: 12,
};

/**
 * What a multimeter reads on a rail.
 *
 * DERIVED, never stored: a reading is a fact about the build at the instant
 * you probe it, so recording one would let the panel disagree with the loom
 * the moment a cable is pulled.
 *
 * The teaching is in the dead cases. A rail reads 0.00V when there is nothing
 * supplying it or the plug is not seated, which is exactly the fault a learner
 * has to find when a machine will not POST — and it is findable here with the
 * same instrument and the same reasoning as on a real bench.
 */
export function railReading(b: BuildState, id: CableId): RailReading {
  const label = CABLE_DEFS[id]?.label ?? id;
  const nominalV = RAIL_V[id] ?? 12;
  const c = chassisOfBuild(b);
  const owner = partsOf(c).find((p) => p.powers?.includes(id));

  if (owner && !isInstalled(b, owner.id)) {
    return { id, label, nominalV, actualV: 0, live: false, note: `No ${owner.label.toLowerCase()} fitted — nothing is driving this rail.` };
  }
  if (owner && isFaulty(b, owner.id)) {
    return { id, label, nominalV, actualV: 0, live: false, note: `${owner.label} has failed — the rail is dead at the source.` };
  }
  if (!b.connected.includes(id)) {
    return { id, label, nominalV, actualV: 0, live: false, note: "Plug not seated — the rail is open at the connector." };
  }
  // A healthy rail sits a hair off nominal, the way a real one does under load.
  const drift = nominalV > 6 ? -0.06 : 0.02;
  return {
    id,
    label,
    nominalV,
    actualV: Math.round((nominalV + drift) * 100) / 100,
    live: true,
    note: "Within tolerance.",
  };
}
