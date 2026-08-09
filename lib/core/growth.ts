/**
 * TriageOS — Company growth phases (v0.6.0)
 * =========================================
 * Every previous release handed the player a 320-person enterprise on turn
 * one: three racks, twelve servers, a directory the size of a small town. It
 * was the finished game with no beginning.
 *
 * v0.6.0 makes the COMPANY the thing that levels up. The operator starts at a
 * 35-person startup with one rack and grows into the enterprise the earlier
 * releases assumed, one milestone at a time.
 *
 * THE DESIGN RULE THAT MATTERS: growth is ADDITIVE, never a regeneration.
 * A milestone hires people and opens departments on the world that already
 * exists — every rack the player cabled, every ACL they set and every ticket
 * they closed survives it. Rebuilding the estate at level 5 would delete the
 * only thing the first five levels produced.
 *
 * AND THE COMPANY HIRES; THE PLAYER SCALES. A milestone does not provision
 * infrastructure. It adds staff, which consumes IP addresses, disk and power,
 * and then files a project ticket asking the operator to deal with it. Auto-
 * provisioning the fix would remove the entire point of the milestone.
 */

export type GrowthPhase = 1 | 2 | 3 | 4;

export interface PhaseSpec {
  phase: GrowthPhase;
  /** Operator level at which the company reaches this size. */
  level: number;
  label: string;
  /** Headcount the directory grows to. */
  employees: number;
  /** Departments (and therefore OUs) that exist at this size. */
  departments: number;
  /** Racks the floor is expected to carry. */
  racks: number;
  /** One line for the milestone notification. */
  blurb: string;
  /** What the operator is being asked to build, in the project ticket. */
  mandate: string[];
}

/**
 * Four sizes, tuned so each milestone lands roughly where the tooling for it
 * unlocks: file-server work at 5 (Shared Drives opens at 3), rack build-out at
 * 10 (Rack Lab and Server Manager open at 5), the full floor at 15.
 */
export const GROWTH_PHASES: PhaseSpec[] = [
  {
    phase: 1,
    level: 1,
    label: "Startup",
    employees: 35,
    departments: 3,
    racks: 1,
    blurb: "A single rack in a converted store cupboard.",
    mandate: [],
  },
  {
    phase: 2,
    level: 5,
    label: "Small business",
    employees: 150,
    departments: 5,
    racks: 1,
    blurb: "Four new departments and a proper file server.",
    mandate: [
      "Open organizational units for the new departments",
      "Give each department a share with group-based access",
      "Make sure the file server has the storage to carry them",
    ],
  },
  {
    phase: 3,
    level: 10,
    label: "Mid-market",
    employees: 300,
    departments: 7,
    racks: 2,
    blurb: "The first rack is out of space, power and cool air.",
    mandate: [
      "Bring a second rack onto the floor",
      "Fit cooling that can carry the new load",
      "Upgrade the top-of-rack switch so every host has a port",
    ],
  },
  {
    phase: 4,
    level: 15,
    label: "Enterprise",
    employees: 450,
    departments: 8,
    racks: 3,
    blurb: "Full datacenter floor, and the redundancy to match.",
    mandate: [
      "Stand up the storage rack",
      "Add redundancy where a single failure would take the business down",
      "Keep every rack inside its power and thermal envelope",
    ],
  },
];

export function phaseSpec(phase: GrowthPhase): PhaseSpec {
  return GROWTH_PHASES.find((p) => p.phase === phase) ?? GROWTH_PHASES[0];
}

/** The size a company of this operator level should be. */
export function phaseForLevel(level: number): GrowthPhase {
  let out: GrowthPhase = 1;
  for (const p of GROWTH_PHASES) {
    if (level >= p.level) out = p.phase;
  }
  return out;
}

/** The next milestone, or null at full scale. */
export function nextPhase(phase: GrowthPhase): PhaseSpec | null {
  return GROWTH_PHASES.find((p) => p.phase === phase + 1) ?? null;
}

/** One recorded expansion, for the growth history the Profile app shows. */
export interface GrowthEvent {
  phase: GrowthPhase;
  at: number;
  /** Headcount before and after, so the jump is legible. */
  from: number;
  to: number;
  /** Departments opened by this expansion. */
  departmentsAdded: string[];
}

export interface GrowthState {
  phase: GrowthPhase;
  /** Current headcount — the directory is the source of truth, this mirrors it
   *  for the UI and for the demand calculations that drive scaling tickets. */
  employees: number;
  /**
   * Phases already applied. A reload, a save restore or a double promotion
   * must never hire the same 115 people twice, and a set is cheaper to reason
   * about than replaying the history.
   */
  applied: GrowthPhase[];
  history: GrowthEvent[];
}

export function initialGrowth(phase: GrowthPhase = 1): GrowthState {
  const spec = phaseSpec(phase);
  return {
    phase,
    employees: spec.employees,
    // Everything up to and including the starting phase counts as applied —
    // a sandbox world that begins at enterprise scale has not "grown" into it.
    applied: GROWTH_PHASES.filter((p) => p.phase <= phase).map((p) => p.phase),
    history: [],
  };
}

// ── Demand: what headcount does to the infrastructure ───────────────────────
//
// These are what turn "the company hired 115 people" into a problem the
// operator has to solve, and they are what the scaling tickets grade against.

/** Usable host addresses in a /N — the DHCP pool a subnet can offer. */
export function poolSize(cidrBits: number): number {
  return Math.max(0, 2 ** (32 - cidrBits) - 2);
}

/**
 * Addresses the estate needs: one per member of staff plus infrastructure and
 * a working margin. A /24 (254 usable) carries a startup comfortably and runs
 * out somewhere in the mid-market — which is exactly when the pool-exhaustion
 * ticket should arrive.
 */
export function addressDemand(employees: number, infraNodes: number): number {
  return Math.ceil(employees * 1.15) + infraNodes;
}

/** Whether the user subnet can still hand out addresses. */
export function poolExhausted(employees: number, infraNodes: number, cidrBits = 24): boolean {
  return addressDemand(employees, infraNodes) > poolSize(cidrBits);
}

/** Home-drive and share storage the headcount implies, in GB. */
export function storageDemandGb(employees: number): number {
  return employees * 12;
}
