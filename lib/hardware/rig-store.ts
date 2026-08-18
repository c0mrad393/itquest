"use client";

/**
 * ITQuest — Hardware bench store
 * ==============================
 * The live rig on the bench. Deliberately a THIN shell: every action delegates
 * to a pure transition in `rig.ts` and writes the result back.
 *
 * That thinness is the deliverable, not an accident of style. The brief asks
 * that this state be mappable onto a 3D canvas later, which is only true if the
 * rules are not in here — a WebGL scene would import the same `canRemove` and
 * `removePart` and behave identically. If any gating logic lived in this file,
 * a second view would have to reimplement it and the two would drift on the
 * first edge case.
 *
 * Session-scoped, not persisted: a bench is a workspace, and a half-torn-down
 * machine surviving a reload would be a state nobody asked to keep. The
 * SCENARIO is what a ticket owns; the teardown in progress is not.
 */

import { create } from "zustand";
import {
  biosDevices,
  buildRig,
  defaultBios,
  insertPart,
  moveBootDevice,
  postHalt,
  resolveBoot,
  rigSpec,
  domainJoinBlocker,
  pendingDrivers,
  telemetry,
  nextAction,
  post,
  removePart,
  setCable,
  toggleFastener,
  type BiosSettings,
  type MachineKind,
  type PostHalt,
  type PostResult,
  type Rig,
  type RigFault,
  type RigSpec,
  type PendingDriver,
  type Telemetry,
} from "./rig";

/**
 * Where the machine is between "open on the bench" and "running an OS".
 *
 * A single phase rather than a pile of booleans, for the same reason the RDP
 * client uses one: `poweredOn && !inBios && !installing` has states that cannot
 * happen, and every one of them is a bug waiting to be written.
 */
export type MachinePhase =
  | "off"
  | "post-halt"
  | "bios"
  | "booting"
  | "installing"
  /** OS is up but unprovisioned: drivers missing, not domain-joined. */
  | "provisioning"
  | "running";

interface HardwareStore {
  rig: Rig;
  /** Which scenario is loaded, so the UI can name the job. */
  fault: RigFault;
  /** Desktop, laptop or server — chooses the topology AND the blueprint. */
  machine: MachineKind;
  /** Slot the operator has selected in the blueprint, if any. */
  selected: string | null;

  phase: MachinePhase;
  halt: PostHalt | null;
  bios: BiosSettings;
  /** Set once an OS has been laid down, which makes the disk bootable. */
  osInstalled: boolean;
  /** Driver ids the operator has installed. Empty on a fresh image. */
  driversInstalled: string[];
  /** The domain this machine joined, or null. */
  joinedDomain: string | null;

  loadScenario: (fault: RigFault, machine?: MachineKind) => void;
  select: (slotId: string | null) => void;

  /** Screws and clips share one action — both are "release before it moves". */
  toggleClip: (slotId: string, fastenerId: string) => void;
  unfastenScrew: (slotId: string, fastenerId: string) => void;

  connectCable: (cableId: string) => void;
  disconnectCable: (cableId: string) => void;

  removeComponent: (slotId: string) => void;
  insertComponent: (slotId: string, partId: string) => void;

  // ── Power cycle ──
  /** Press the power button: runs POST and lands in halt, BIOS or booting. */
  powerOn: () => void;
  powerOff: () => void;
  enterBios: () => void;
  moveBoot: (deviceId: string, dir: "up" | "down") => void;
  setBiosFlag: (key: "virtualization" | "secureBoot", on: boolean) => void;
  /** Save and exit — re-resolves the boot device and hands off. */
  saveAndReboot: () => void;
  /** The installer finished; the disk is now bootable. */
  completeInstall: () => void;
  installDriver: (driverId: string) => void;
  /** Refused when the model says the machine cannot reach a DC yet. */
  joinDomain: (domain: string) => boolean;
  /** Provisioning done — the machine is handed over. */
  finishProvisioning: () => void;

  /** Derived, never stored — see the note on `post`. */
  postResult: () => PostResult;
  spec: () => RigSpec;
  sensors: () => Telemetry;
  drivers: () => PendingDriver[];
  joinBlocker: () => string | null;
  hint: () => { slotId: string; hint: string } | null;
}

const START = buildRig("desktop", "faulty-ram");

export const useHardwareStore = create<HardwareStore>((set, get) => ({
  rig: START,
  fault: "faulty-ram",
  machine: "desktop",
  selected: null,
  phase: "off",
  halt: null,
  bios: defaultBios(START, false),
  osInstalled: false,
  driversInstalled: [],
  joinedDomain: null,

  loadScenario: (fault, machine) => {
    const kind = machine ?? get().machine;
    const rig = buildRig(kind, fault);
    // A new bench is a new machine: powering down and clearing the OS flag
    // stops a previous scenario's install from making this one's blank disk
    // look bootable.
    set({
      rig, fault, machine: kind, selected: null,
      phase: "off", halt: null, osInstalled: false, bios: defaultBios(rig, false),
      driversInstalled: [], joinedDomain: null,
    });
  },
  select: (slotId) => set({ selected: slotId }),

  /*
   * `toggleClip` and `unfastenScrew` are separate entry points because the
   * brief names them separately and because they read differently at the call
   * site — but they are the same transition underneath, since the model already
   * distinguishes a clip from a screw by its `kind`. Two implementations of one
   * rule is how the two get to disagree later.
   */
  toggleClip: (slotId, fastenerId) => set((s) => ({ rig: toggleFastener(s.rig, slotId, fastenerId) })),
  unfastenScrew: (slotId, fastenerId) => set((s) => ({ rig: toggleFastener(s.rig, slotId, fastenerId) })),

  connectCable: (cableId) => set((s) => ({ rig: setCable(s.rig, cableId, true) })),
  disconnectCable: (cableId) => set((s) => ({ rig: setCable(s.rig, cableId, false) })),

  // Both refuse illegal moves inside the model rather than here, so a view that
  // forgets to check `canRemove` gets "nothing happened" instead of a torn rig.
  removeComponent: (slotId) => set((s) => ({ rig: removePart(s.rig, slotId) })),
  insertComponent: (slotId, partId) => set((s) => ({ rig: insertPart(s.rig, slotId, partId) })),

  /*
   * The power button is where the physical model and the firmware meet.
   *
   * POST is re-derived here rather than read from a flag, so a machine that was
   * halting for a loose cooler boots the moment the screw goes back in — no
   * "clear the error" step, because a real machine does not have one.
   */
  powerOn: () => {
    const halt = postHalt(get().rig);
    if (halt) return set({ phase: "post-halt", halt });
    set({ phase: "bios", halt: null, bios: defaultBios(get().rig, get().osInstalled) });
  },
  powerOff: () => set({ phase: "off", halt: null }),
  enterBios: () =>
    set((s) => ({ phase: "bios", bios: { ...s.bios, bootOrder: biosDevices(s.rig, s.osInstalled) } })),

  moveBoot: (deviceId, dir) => set((s) => ({ bios: moveBootDevice(s.bios, deviceId, dir) })),
  setBiosFlag: (key, on) => set((s) => ({ bios: { ...s.bios, [key]: on } })),

  saveAndReboot: () => {
    const target = resolveBoot(get().bios);
    // Nothing bootable is not an error state to invent — it is the "no boot
    // device found" every technician has seen, and it belongs in the halt path.
    if (!target) {
      return set({
        phase: "post-halt",
        halt: { code: "0x7F", beeps: "none", screen: "No bootable device — insert boot media" },
      });
    }
    set({ phase: target.kind === "usb" ? "installing" : "running" });
  },

  /*
   * Setup finishes into PROVISIONING, not into "running".
   *
   * A freshly imaged machine is not a finished machine — it has no drivers and
   * belongs to no domain. Jumping straight to a working desktop would skip the
   * two steps that make this an IT exercise rather than a build video.
   */
  completeInstall: () => set({ osInstalled: true, phase: "provisioning" }),

  installDriver: (driverId) =>
    set((s) =>
      s.driversInstalled.includes(driverId)
        ? s
        : { driversInstalled: [...s.driversInstalled, driverId] },
    ),

  joinDomain: (domain) => {
    // The MODEL decides whether this can work; the dialog only reports it.
    if (domainJoinBlocker(get().driversInstalled)) return false;
    set({ joinedDomain: domain });
    return true;
  },

  finishProvisioning: () => set({ phase: "running" }),

  postResult: () => post(get().rig),
  spec: () => rigSpec(get().rig),
  sensors: () => telemetry(get().rig),
  drivers: () => pendingDrivers(get().rig, get().driversInstalled),
  joinBlocker: () => domainJoinBlocker(get().driversInstalled),
  hint: () => nextAction(get().rig),
}));
