"use client";

/**
 * ITQuest — Desktop simulator store
 * =================================
 * A thin shell over `parts.ts`, for the same reason the rig store was thin:
 * every rule is a pure function, so a different renderer — or a test — can ask
 * the same questions and get the same answers.
 *
 * Session-scoped. A half-built PC surviving a reload is not a state anyone
 * asked to keep.
 */

import { create } from "zustand";
import { CHASSIS, type Chassis, type ChassisId } from "./chassis";
import {
  EMPTY_BUILD,
  biosDevices,
  canRemove,
  chassisOfBuild,
  emptyBuild,
  populatedBuild,
  remove,
  removeBlockedBy,
  canInstall,
  connect,
  defaultBios,
  domainJoinBlocker,
  install,
  moveBootDevice,
  nextStep,
  pendingDrivers,
  postHalt,
  report,
  reset,
  resolveBoot,
  specOf,
  telemetry,
  type BiosSettings,
  type BuildReport,
  type BuildState,
  type CableId,
  type PartId,
  type PendingDriver,
  type PostHalt,
  type RigSpec,
  type Step,
  type Telemetry,
} from "./parts";

/**
 * Where the machine is between "parts on the desk" and "handed over".
 *
 * One phase rather than a pile of booleans: `poweredOn && !inBios &&
 * !installing` has states that cannot happen, and each is a bug waiting to be
 * written.
 */
export type SimPhase =
  | "bench"
  | "post-halt"
  | "bios"
  | "installing"
  | "provisioning"
  | "running";

interface DesktopSimStore {
  build: BuildState;
  /** Part the operator has picked up off the desk, if any. */
  held: PartId | null;
  /** Part under the cursor, for the snap highlight. */
  hovered: PartId | null;

  phase: SimPhase;
  halt: PostHalt | null;
  bios: BiosSettings;
  osInstalled: boolean;
  driversInstalled: string[];
  joinedDomain: string | null;
  /** Hostname the estate gave this machine once commissioned. */
  registeredAs: string | null;

  pick: (id: PartId | null) => void;
  hover: (id: PartId | null) => void;
  place: (id: PartId) => void;
  /** Take a part back out. The other half of a repair. */
  pull: (id: PartId) => void;
  route: (id: CableId) => void;
  restart: () => void;
  /** Put a fresh, empty machine of this type on the bench. */
  startBuild: (chassis: ChassisId) => void;
  /**
   * Put an ASSEMBLED machine on the bench with named parts failed. This is
   * what a repair ticket opens: the work is to get the bad part out and a
   * sound one in, not to build the box again.
   */
  startRepair: (chassis: ChassisId, faulty: PartId[]) => void;

  // ── Power and firmware ──
  powerOn: () => void;
  powerOff: () => void;
  enterBios: () => void;
  moveBoot: (id: string, dir: "up" | "down") => void;
  setBiosFlag: (k: "virtualization" | "secureBoot", on: boolean) => void;
  saveAndReboot: () => void;
  completeInstall: () => void;
  installDriver: (id: string) => void;
  joinDomain: (domain: string) => boolean;
  finishProvisioning: () => void;
  setRegistered: (hostname: string) => void;

  /** Derived on read — no completion flag to fall out of sync. */
  status: () => BuildReport;
  sensors: () => Telemetry;
  spec: () => RigSpec;
  drivers: () => PendingDriver[];
  joinBlocker: () => string | null;
  guidance: () => Step | null;
  placeable: (id: PartId) => boolean;
  removable: (id: PartId) => boolean;
  removeReason: (id: PartId) => string | null;
  chassis: () => Chassis;
}

export const useDesktopSimStore = create<DesktopSimStore>((set, get) => ({
  build: EMPTY_BUILD,
  held: null,
  hovered: null,
  phase: "bench",
  halt: null,
  bios: defaultBios(EMPTY_BUILD, false),
  osInstalled: false,
  driversInstalled: [],
  joinedDomain: null,
  registeredAs: null,

  pick: (id) => set((s) => ({ held: s.held === id ? null : id })),
  hover: (id) => set({ hovered: id }),

  // Illegal placements are refused inside the model, so a view that forgets to
  // check `canInstall` gets "nothing happened" rather than an impossible build.
  place: (id) => set((s) => ({ build: install(s.build, id), held: null })),
  pull: (id) => set((s) => ({ build: remove(s.build, id), held: null })),
  route: (id) => set((s) => ({ build: connect(s.build, id) })),
  restart: () =>
    set((s) => {
      const fresh = reset(s.build.chassis);
      return {
        build: fresh, held: null, hovered: null,
        phase: "bench", halt: null, osInstalled: false,
        driversInstalled: [], joinedDomain: null, registeredAs: null,
        bios: defaultBios(fresh, false),
      };
    }),

  startBuild: (chassis) =>
    set(() => {
      const fresh = emptyBuild(chassis);
      return {
        build: fresh, held: null, hovered: null,
        phase: "bench", halt: null, osInstalled: false,
        driversInstalled: [], joinedDomain: null, registeredAs: null,
        bios: defaultBios(fresh, false),
      };
    }),

  startRepair: (chassis, faulty) =>
    set(() => {
      const b = populatedBuild(CHASSIS[chassis], faulty);
      return {
        build: b, held: null, hovered: null,
        phase: "bench", halt: null, osInstalled: false,
        driversInstalled: [], joinedDomain: null, registeredAs: null,
        bios: defaultBios(b, false),
      };
    }),

  /*
   * POST is re-derived on every press rather than read from a flag, so a
   * machine that halted for a missing cooler boots the moment the cooler goes
   * on. There is no error to clear, because a real machine has none.
   */
  powerOn: () => {
    const halt = postHalt(get().build);
    if (halt) return set({ phase: "post-halt", halt });
    set({ phase: "bios", halt: null, bios: defaultBios(get().build, get().osInstalled) });
  },
  powerOff: () => set({ phase: "bench", halt: null }),
  enterBios: () =>
    set((s) => ({ phase: "bios", bios: { ...s.bios, bootOrder: biosDevices(s.build, s.osInstalled) } })),

  moveBoot: (id, dir) => set((s) => ({ bios: moveBootDevice(s.bios, id, dir) })),
  setBiosFlag: (k, on) => set((s) => ({ bios: { ...s.bios, [k]: on } })),

  saveAndReboot: () => {
    const target = resolveBoot(get().bios);
    // Nothing bootable is not an invented error — it is the "no boot device"
    // every technician has seen, and it belongs in the halt path.
    if (!target) {
      return set({
        phase: "post-halt",
        halt: { code: "0x7F", beeps: "none", screen: "No bootable device — insert boot media" },
      });
    }
    set({ phase: target.kind === "usb" ? "installing" : "running" });
  },

  // Setup finishes into PROVISIONING, not "running": a freshly imaged machine
  // has no drivers and belongs to no domain, and skipping that would skip the
  // part that makes this an IT exercise rather than a build video.
  completeInstall: () => set({ osInstalled: true, phase: "provisioning" }),

  installDriver: (id) =>
    set((s) => (s.driversInstalled.includes(id) ? s : { driversInstalled: [...s.driversInstalled, id] })),

  joinDomain: (domain) => {
    if (domainJoinBlocker(get().driversInstalled)) return false;
    set({ joinedDomain: domain });
    return true;
  },

  finishProvisioning: () => set({ phase: "running" }),
  setRegistered: (hostname) => set({ registeredAs: hostname }),

  status: () => report(get().build),
  sensors: () => telemetry(get().build),
  spec: () => specOf(get().build),
  drivers: () => pendingDrivers(get().build, get().driversInstalled),
  joinBlocker: () => domainJoinBlocker(get().driversInstalled),
  guidance: () => nextStep(get().build),
  placeable: (id) => canInstall(get().build, id),
  removable: (id) => canRemove(get().build, id),
  removeReason: (id) => removeBlockedBy(get().build, id),
  chassis: () => chassisOfBuild(get().build),
}));
