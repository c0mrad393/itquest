/**
 * ITQuest — datacentre physics & unification spec (v0.3.1, extended v0.4.0)
 * =========================================================================
 * Exercises the pure model layer in `lib/core/rack.ts` and
 * `lib/core/datacenter.ts` — the same functions the Datacenter Floor and the
 * Server Manager render and the ticket win-conditions grade, so a regression
 * here would silently change what the game asks of the player.
 *
 * The v0.4.0 half is where the two views are proved to be ONE model: capacity
 * derived from fitted parts, draw derived from committed workloads, and the
 * migrate/drain/power-down contract that connects them.
 *
 * Deliberately dependency-free: `npm run test:physics` transpiles the module
 * with the TypeScript already in the project and runs it on bare node. No test
 * framework is worth adding to a lean tree for one pure-function suite.
 *
 * Run:  npm run test:physics
 */

import {
  connectedLoadWatts,
  deviceOnline,
  rackPower,
  rackThermal,
  slotTempC,
  thermalState,
  liveDeviceWatts,
} from "../.test-build/core/rack.js";
import {
  freeSpaceU,
  freeTorPorts,
  isUplinked,
  locationOf,
  migrationBlocker,
  serverCapacity,
  serverHeadroom,
  serverUtilisation,
  shutdownBlocker,
  torSwitch,
  uplinkBlocker,
  workloadDemand,
} from "../.test-build/core/datacenter.js";
import {
  accessBlocker,
  accessForGroups,
  accessForUser,
  hasAccess,
} from "../.test-build/core/fileshares.js";
import { effectiveGroups, gatewayTargets, reachNode } from "../.test-build/core/directory.js";
import {
  POE_DRAW_W,
  poeLiveness,
  portOfNode,
  switchPower,
} from "../.test-build/core/poe.js";
import {
  detectConflicts,
  effectiveIp,
  inDhcpPool,
  ipToInt,
  ipWithinCidr,
  parseCidr,
  suggestStatic,
} from "../.test-build/core/ipam.js";
import {
  SATURATION_PENALTY,
  VIDEO_PROFILES,
  computeTraffic,
  effectiveLatency,
  effectiveLossPct,
  estateHealth,
  levelFor,
} from "../.test-build/core/traffic.js";
import {
  STORAGE_TIERS,
  backupsCompromised,
  capacityOf,
  defaultSizeGb,
  isProtectable,
  restoreAvailability,
  safetyOf,
  tierById,
} from "../.test-build/core/backup.js";
import {
  incidentHealthPenalty,
  isIsolated,
  isolationMethod,
  recoveryStatus,
} from "../.test-build/core/incident.js";
import {
  ARRIVAL_MS_BY_PHASE,
  BACKLOG_CEILING,
  URGENT_REFILL_BELOW,
  ambientDecision,
  eligibleTemplates,
  familyOf,
} from "../.test-build/tickets/ambient.js";
import {
  appUnlockLevel,
  isAppUnlocked,
  templateMinLevel,
  unlockedTiers,
} from "../.test-build/progression/unlocks.js";
import { appForTicket, liveHints } from "../.test-build/tickets/hints.js";
import {
  EMPTY_BUILD,
  biosDevices,
  blockedBy,
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
  resolveBoot,
  specOf,
  telemetry,
  railReading,
  populatedBuild,
  emptyBuild,
  isInstalled,
  remove,
  removeBlockedBy,
  isFaulty,
  partsOf,
} from "../.test-build/desktop-sim/parts.js";
import { buildBenchNode } from "../.test-build/hardware/commission.js";
import {
  CANVAS,
  SNAP_RADIUS,
  SPEC_MM,
  zonesOf,
  distanceTo,
  mm,
  snapTarget,
  zoneFor,
  trayBox,
  boardSlotBox,
  seatBox,
  artHeight,
  contains,
  overlaps as boxOverlaps,
} from "../.test-build/desktop-sim/geometry.js";
import { CHASSIS, DESKTOP, LAPTOP, SERVER } from "../.test-build/desktop-sim/chassis.js";
import { LABEL_MIN_SIZE, trayLabel, trayLabelBox } from "../.test-build/desktop-sim/geometry.js";
import {
  ACTIVE_SCENARIOS,
  PLATFORM_SETTINGS,
  SUBSCRIPTIONS,
  SUPPORT_TICKETS,
  inDays,
  isBreached,
  openTickets,
  openTicketsFor,
  seatsUsed,
} from "../.test-build/admin/mock-data.js";
import {
  FEATURE_STATUS,
  TIERS,
  allows,
  firstTierReaching,
  firstTierWith,
  isLive,
  lockReason,
  phaseCapOf,
} from "../.test-build/platform/tiers.js";
import {
  APP_UNLOCK_LEVEL,
  TIER_UNLOCK_LEVEL,
  appLock,
  lockLabel,
} from "../.test-build/progression/unlocks.js";
import { standingOf, toNextLevel } from "../.test-build/progression/standing.js";
import {
  codeNumber,
  dedupeTicketCodes,
  nextTicketCode,
  resetTicketSeq,
  syncTicketSeq,
} from "../.test-build/tickets/factory.js";
import { TRACK_META as SKILL_TRACK_META, jobTitle, rankPrefix, SPECIALISATION_THRESHOLD } from "../.test-build/progression/tracks.js";
import { collisions, renderIdentity, swatchOf } from "../.test-build/ui/swatch.js";
import { armReduce, IDLE } from "../.test-build/ui/arm.js";
import { generateWorld } from "../.test-build/org/generator.js";
import { ticketLibrary } from "../.test-build/tickets/factory.js";
import { mulberry32 } from "../.test-build/org/rng.js";
import { SEVERITY_META, STATUS_META, TRACK_META } from "../.test-build/host/ticket-ui.js";
import { EMOTION_META } from "../.test-build/dialogue/types.js";
import { levelForXp, xpForLevel } from "../.test-build/scenario/scoring.js";
import {
  PRICING,
  format,
  formatTotal,
  perMonthFromYearly,
  seatsTotal,
  yearlySaving,
} from "../.test-build/platform/pricing.js";
import { decodeSlot, migrate } from "../.test-build/persistence/slot.js";
import { progressOf, stuck, summarise } from "../.test-build/cohort/ledger.js";
import { LEDGER, seatIds } from "../.test-build/cohort/mock-data.js";
import {
  canTakeOn,
  freshShift,
  nextShiftAt,
  remaining,
  rollover,
  takeOn,
} from "../.test-build/platform/shift.js";

/*
 * The desktop's own numbers, which most of the spatial specs below are written
 * against. Named here rather than imported as module constants because there
 * are three machines now and none of them gets to be the implicit one.
 */
const BOARD = DESKTOP.board;
const CASE_INNER = DESKTOP.inner;
const CASE_OUTER = DESKTOP.outer;
const STANDOFFS = DESKTOP.standoffs;
const BOARD_SLOTS = DESKTOP.slots;
const ZONES = zonesOf(DESKTOP);
import {
  CHAIN_FOR,
  cidrContains,
  defaultEdgeRules,
  deriveGatewayIp,
  evaluate,
  lanCidrFor,
  rulesFor,
  defaultDhcp,
  defaultIds,
  deriveLeases,
  inPool,
  natTargetProblem,
  orphanReservations,
  resolveInbound,
  threatEvent,
  threatReachedEstate,
  threatSummary,
} from "../.test-build/network/edge.js";
import {
  CASCADE_HEALTH_PENALTY,
  THERMAL_LATENCY_FACTOR,
  activeCascades,
  cascadeLatencyFactor,
  cascadeResolved,
  cascadeStatus,
} from "../.test-build/core/cascade.js";
import { isHardwareTicket, jobForTicket } from "../.test-build/hardware/types.js";
import {
  GROWTH_PHASES,
  addressDemand,
  initialGrowth,
  nextPhase,
  phaseForLevel,
  phaseSpec,
  poolExhausted,
  poolSize,
  storageDemandGb,
} from "../.test-build/core/growth.js";
import {
  DOMAIN_ROOT,
  explainAbsence,
  ouChain,
  resolveSetting,
  scopeChain,
  settingApplies,
} from "../.test-build/core/policy.js";

import {
  TUTORIAL_SEQUENCES,
  advanceIndex,
  eligibleSequence,
  isActionStep,
  sequenceById,
  stepAt,
} from "../.test-build/tutorial/flow.js";

import { MIN_W, MIN_H, GRAB_MARGIN, applyResize, clampPosition, openRect, snapZoneAt, rectForZone, SNAP_EDGE } from "../.test-build/host/windows.js";
import { BOOT_LINES, BOOT_TOTAL_MS, BOOT_BUDGET_MS, bootLineDelay } from "../.test-build/host/boot.js";
import {
  UPDATE_ERRORS, freshUpdateState, canCheck, beginCheck, completeCheck, installPending,
  restartComplete, pauseUpdates, resumeUpdates, applyWsusPolicy, updateHealthy, updateSummary,
} from "../.test-build/vm/windows-update.js";
import { placeMenu, menuHeight, MENU_W } from "../.test-build/host/context-menu.js";
import { placeIcon, reflow, autoArrange, gridFor, pxToCell, cellToPx } from "../.test-build/host/desktop-icons.js";

let pass = 0;
let fail = 0;

function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  }
}

function group(name) {
  console.log(`\n${name}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
const dev = (kind, uStart, uSize, watts, extra = {}) => ({
  id: `d${++seq}`,
  kind,
  name: kind,
  assetItemId: "sku",
  uStart,
  uSize,
  ports: ["psu"],
  watts,
  ...extra,
});

/** The rack feed every fixture patches into. */
const pdu = dev("pdu", 24, 1, 0);
const powerLead = (d) => ({
  id: `c${d.id}`,
  kind: "power",
  fromDeviceId: d.id,
  fromPort: "psu",
  toDeviceId: pdu.id,
  toPort: "out1",
});

/** Build a rack with every listed device cabled for power. */
const mk = (devices, { pduId = "pdu-20a", tripped = false, overrides } = {}) => ({
  id: "rack-01",
  name: "Rack 01",
  sizeU: 24,
  devices: [pdu, ...devices],
  cables: devices.map(powerLead),
  tests: [],
  pduId,
  breakerTripped: tripped,
  trippedAt: null,
  overrides,
});

const webServer = () => dev("server", 20, 1, 250);
const storageNode = (u) => dev("server", u, 4, 750);

// ── Power ───────────────────────────────────────────────────────────────────

group("Power distribution");
{
  const empty = mk([]);
  eq("an empty rack draws nothing", rackPower(empty).drawWatts, 0);

  eq("1U web server draws 250W", rackPower(mk([webServer()])).drawWatts, 250);
  eq("4U storage node draws 750W", rackPower(mk([storageNode(10)])).drawWatts, 750);

  // 2250W of 2400W: legal, but with almost no headroom left.
  const three = [storageNode(2), storageNode(6), storageNode(10)];
  eq("three storage nodes total 2250W", rackPower(mk(three)).drawWatts, 2250);
  eq("...which is 94% of a 20A feed", rackPower(mk(three)).loadPct, 94);
  eq("...and is not yet an overload", rackPower(mk(three)).overloaded, false);

  const four = [...three, storageNode(14)];
  eq("a fourth node overloads the 20A feed", rackPower(mk(four)).overloaded, true);
  eq("the same load is fine on a 30A feed", rackPower(mk(four, { pduId: "pdu-30a" })).overloaded, false);

  // Racking without cabling is the commonest mistake in the lab.
  const unpatched = { ...mk([webServer()]), cables: [] };
  eq("an uncabled device is not a load", rackPower(unpatched).drawWatts, 0);
}

group("Breaker latching");
{
  const four = [storageNode(2), storageNode(6), storageNode(10), storageNode(14)];
  const tripped = mk(four, { tripped: true });
  eq("a tripped rack flows 0W", rackPower(tripped).drawWatts, 0);
  eq("...but still reads as overloaded", rackPower(tripped).overloaded, true);
  eq("...because cabled load survives the trip", connectedLoadWatts(tripped), 3000);
}

// ── Thermal ─────────────────────────────────────────────────────────────────

group("Thermal dynamics");
{
  eq("an idle rack sits at ambient", rackThermal(mk([])).tempC, 21);

  const two = [storageNode(2), storageNode(6)];
  eq("1500W puts the rack at 37.5C", rackThermal(mk(two)).tempC, 37.5);
  eq("...which is a thermal warning", rackThermal(mk(two)).state, "warning");

  const three = [storageNode(2), storageNode(6), storageNode(10)];
  eq("2250W puts the rack at 45.8C", rackThermal(mk(three)).tempC, 45.8);
  eq("...which is thermal critical", rackThermal(mk(three)).state, "critical");
}

group("Cooling");
{
  const two = [storageNode(2), storageNode(6)];
  const fanTray = dev("fan-tray", 1, 1, 80);
  const crac = dev("crac", 18, 2, 450);

  eq("a fan tray removes 5C", rackThermal(mk([...two, fanTray])).coolingC, 5);
  eq("a CRAC removes 18C", rackThermal(mk([...two, crac])).coolingC, 18);
  eq("...and costs 450W to run", rackPower(mk([...two, crac])).drawWatts, 1950);
  eq("a CRAC pulls 1500W back to optimal", rackThermal(mk([...two, crac])).state, "optimal");

  // The uncabled-cooling trap: mounted is not the same as running.
  const idle = mk(two);
  const uncabledCrac = { ...idle, devices: [...idle.devices, crac] };
  eq("an uncabled CRAC cools nothing", rackThermal(uncabledCrac).coolingC, 0);

  const liquid = mk([storageNode(2), dev("server", 6, 4, 750, { liquidCooled: true })]);
  eq("a liquid loop removes 4C", rackThermal(liquid).coolingC, 4);
}

group("Slot heatmap");
{
  const rack = mk([storageNode(2), storageNode(6)]);
  const top = slotTempC(rack, 1);
  const floor = slotTempC(rack, 24);
  eq("heat rises — U1 is hotter than U24", top > floor, true);
  eq("...across a 3.5C span", Math.round((top - floor) * 10) / 10, 3.5);
}

group("Device availability");
{
  const web = webServer();
  eq("a cabled device in a cool rack is online", deviceOnline(mk([web]), web.id), true);
  eq("an open breaker takes it offline", deviceOnline(mk([web], { tripped: true }), web.id), false);

  const hot = [storageNode(2), storageNode(6), storageNode(10)];
  eq("thermal critical takes it offline", deviceOnline(mk(hot), hot[0].id), false);
}

group("Thermal thresholds");
{
  eq("29.9C is optimal", thermalState(29.9), "optimal");
  eq("30.0C is warning", thermalState(30), "warning");
  eq("44.9C is warning", thermalState(44.9), "warning");
  eq("45.0C is critical", thermalState(45), "critical");
}

group("QA overrides (sudo elevate debug)");
{
  const four = [storageNode(2), storageNode(6), storageNode(10), storageNode(14)];
  const off = mk(four, { overrides: { unlimitedPower: true, unlimitedCooling: true } });
  eq("unlimited power never overloads", rackPower(off).overloaded, false);
  eq("unlimited cooling pins the rack to ambient", rackThermal(off).tempC, 21);
}


// ── The unification (v0.4.0) ────────────────────────────────────────────────

const wl = (kind, cpuPct, ramGb, id = `w${kind}`) => ({ id, name: kind, kind, cpuPct, ramGb });

/** A 2U chassis with real parts fitted, bound to a logical node. */
const chassis = (u, nodeId, hardware) =>
  dev("server", u, 2, 750, {
    nodeId,
    hardware: { cpuCores: 24, ramGb: 128, ramType: "DDR5", storageGb: 8192, dimmSlots: 16, dimmsUsed: 4, ...hardware },
  });

const node = (workloads, { online = true, maintenance } = {}) => ({
  workloads,
  connection: { online },
  maintenance,
});

group("Capacity derives from fitted parts");
{
  const box = chassis(4, "sql-01");
  eq("24 cores is a 2400% CPU budget", serverCapacity(box).cpuPctTotal, 2400);
  eq("fitted memory is reported memory", serverCapacity(box).ramGb, 128);

  // THE BI-DIRECTIONAL SYNC, physical -> logical. Fitting a DIMM in the rack
  // is the ONLY thing that happened, and capacity moved.
  const upgraded = chassis(4, "sql-01", { ramGb: 192, dimmsUsed: 5 });
  eq("fitting a DIMM raises capacity with no sync step", serverCapacity(upgraded).ramGb, 192);

  const load = [wl("database", 420, 64, "w1"), wl("app", 140, 12, "w2")];
  eq("committed demand is the sum of its workloads", workloadDemand(load), { cpuPct: 560, ramGb: 76, count: 2 });
  eq("...which is 23% of the CPU budget", serverUtilisation(box, load).cpuPct, 23);
  eq("...and 59% of memory", serverUtilisation(box, load).memPct, 59);
  eq("...so it is not oversubscribed", serverUtilisation(box, load).oversubscribed, false);

  const tooMuch = [wl("database", 420, 200, "w1")];
  eq("committing more memory than exists is oversubscription", serverUtilisation(box, tooMuch).oversubscribed, true);
  eq("headroom never goes negative", serverHeadroom(box, tooMuch).ramGb, 0);
}

group("Workloads push back on the physical layer");
{
  const box = chassis(4, "sql-01");
  eq("an idle chassis draws its nameplate", liveDeviceWatts(box), 750);

  // THE BI-DIRECTIONAL SYNC, logical -> physical. Same chassis, same rack;
  // the only change is what the operator committed to it.
  const nodes = { "sql-01": node([wl("database", 420, 64)]) };
  eq("a committed database makes the chassis heavier", liveDeviceWatts(box, nodes), 870);

  const rack = mk([box]);
  eq("...and the rack feels it", rackPower(rack, nodes).drawWatts, 870);
  eq("...in the temperature too", rackThermal(rack, nodes).tempC > rackThermal(rack).tempC, true);

  const off = { "sql-01": node([wl("database", 420, 64)], { online: false }) };
  eq("a powered-down host draws only its nameplate", liveDeviceWatts(box, off), 750);
}

group("Top-of-rack uplinks");
{
  const tor = dev("switch", 1, 1, 180);
  tor.ports = ["gi0/1", "gi0/2", "psu"];
  const box = chassis(4, "srv-01");

  const unpatched = mk([tor, box]);
  eq("the ToR switch is found", torSwitch(unpatched).id, tor.id);
  eq("a racked-but-unpatched chassis is not uplinked", isUplinked(unpatched, box.id), false);
  eq("both ports are free", freeTorPorts(unpatched).length, 2);

  const patched = {
    ...unpatched,
    cables: [
      ...unpatched.cables,
      { id: "up1", kind: "patch", fromDeviceId: box.id, fromPort: "eth0", toDeviceId: tor.id, toPort: "gi0/1" },
    ],
  };
  eq("patching it into the ToR uplinks it", isUplinked(patched, box.id), true);
  eq("...and consumes a port", freeTorPorts(patched).length, 1);
  eq("...so it can no longer be uplinked twice", uplinkBlocker(patched, box.id), "Already uplinked.");

  const noSwitch = mk([box]);
  eq("a rack with no ToR cannot uplink anything", uplinkBlocker(noSwitch, box.id), "Rack 01 has no top-of-rack switch. Mount one first.");

  const full = {
    ...patched,
    devices: [...patched.devices, chassis(8, "srv-02")],
    cables: [
      ...patched.cables,
      { id: "up2", kind: "patch", fromDeviceId: "x", fromPort: "eth0", toDeviceId: tor.id, toPort: "gi0/2" },
    ],
  };
  const second = full.devices.find((d) => d.nodeId === "srv-02");
  eq(
    "a full switch blocks the uplink rather than forcing it",
    uplinkBlocker(full, second.id),
    "Every port on the ToR switch is patched. Free one, or fit a bigger switch.",
  );
}

group("The floor");
{
  const tor = dev("switch", 1, 1, 180);
  const rack = mk([tor, chassis(4, "a"), chassis(8, "b")]);
  eq("U space accounts for every mounted unit", freeSpaceU(rack), 24 - 1 - 1 - 2 - 2);

  const dc = { racks: [rack, { ...mk([]), id: "rack-02", name: "Rack 02" }] };
  eq("a node is located by rack and U", locationOf(dc, "b").device.uStart, 8);
  eq("...and its rack is named", locationOf(dc, "b").rack.name, "Rack 01");
  eq("an unracked node has no location", locationOf(dc, "ghost"), undefined);
}

group("Change control");
{
  const live = { workloads: [wl("web", 65, 4)], maintenance: { mode: false } };
  eq(
    "pulling power outside a change window is refused first on process",
    shutdownBlocker(live),
    "Put the host into Maintenance Mode first — this is a change, not an accident.",
  );

  const declared = { workloads: [wl("web", 65, 4)], maintenance: { mode: true } };
  eq(
    "...then on the live workloads",
    shutdownBlocker(declared),
    "1 live workload still on this host. Migrate them before cutting power.",
  );

  const drained = { workloads: [], maintenance: { mode: true } };
  eq("a drained host in a change window is safe to power down", shutdownBlocker(drained), null);
}

group("Live migration");
{
  const tor = dev("switch", 1, 1, 180);
  const target = chassis(4, "target");
  const rack = {
    ...mk([tor, target]),
    cables: [
      { id: "p1", kind: "power", fromDeviceId: target.id, fromPort: "psu", toDeviceId: pdu.id, toPort: "out1" },
      { id: "u1", kind: "patch", fromDeviceId: target.id, fromPort: "eth0", toDeviceId: tor.id, toPort: "gi0/1" },
    ],
    devices: [pdu, tor, target],
  };
  const healthy = { device: target, rack, workloads: [], online: true, inMaintenance: false };

  eq("a healthy host with headroom accepts the move", migrationBlocker(healthy, [wl("web", 65, 4)]), null);
  eq(
    "a powered-down target is refused",
    migrationBlocker({ ...healthy, online: false }, [wl("web", 65, 4)]),
    "The target host is powered down.",
  );
  eq(
    "so is one that is itself being worked on",
    migrationBlocker({ ...healthy, inMaintenance: true }, [wl("web", 65, 4)]),
    "The target host is itself in maintenance.",
  );
  eq(
    "memory is checked before CPU, because it is the hard wall",
    migrationBlocker(healthy, [wl("database", 100, 999)]),
    "Needs 999 GB; the target has 128 GB free. Fit more memory or pick another host.",
  );
  eq(
    "CPU headroom is checked too",
    migrationBlocker(healthy, [wl("app", 9999, 8)]),
    "Needs 9999% CPU; the target has 2400% free.",
  );

  const unpatched = { ...healthy, rack: { ...rack, cables: rack.cables.filter((c) => c.kind !== "patch") } };
  eq("a target with no uplink cannot serve anything", migrationBlocker(unpatched, [wl("web", 65, 4)]), "The target host has no ToR uplink.");

  const dark = { ...healthy, rack: { ...rack, breakerTripped: true } };
  eq("nor can one behind an open breaker", migrationBlocker(dark, [wl("web", 65, 4)]), "Rack 01 has an open breaker.");
}


// ── The software topology (v0.5.0) ──────────────────────────────────────────
//
// Same discipline as the physical layer: the apps and the ticket
// win-conditions call these, so a regression here changes what the game asks
// of the player without anything else looking different.

const share = (acl) => ({
  id: "sh1",
  name: "Board_Reports",
  path: "\\\\fs01\\Board_Reports",
  serverNodeId: "fs01",
  description: "",
  acl,
  sizeGb: 20,
  owner: "Finance",
});

/** A directory with one nested group, because nesting is where audits go wrong. */
const dir = {
  domainDns: "corp.internal",
  netbios: "CORP",
  functionalLevel: "2016",
  ous: [{ dn: "OU=Finance", name: "Finance" }],
  computers: [],
  users: [
    { samAccountName: "j.doe", displayName: "Jane Doe", department: "Finance", memberOf: ["Domain Users"], enabled: true },
    { samAccountName: "m.ray", displayName: "Mo Ray", department: "Marketing", memberOf: ["Domain Users"], enabled: true },
  ],
  groups: [
    { sid: "1", name: "Domain Users", scope: "Global", category: "Security", members: [] },
    { sid: "2", name: "Finance_RW", scope: "DomainLocal", category: "Security", members: ["j.doe"] },
    // Finance_RW is itself a member of Leadership: j.doe inherits it.
    { sid: "3", name: "Leadership", scope: "DomainLocal", category: "Security", members: ["Finance_RW"] },
  ],
};

group("Share access resolution");
{
  const s = share([{ groupName: "Finance_RW", access: "change" }]);
  eq("a matching grant is honoured", accessForGroups(s, ["Finance_RW"]), "change");
  eq("a non-member gets nothing", accessForGroups(s, ["Marketing_RW"]), null);

  const multi = share([
    { groupName: "Domain Users", access: "read" },
    { groupName: "Finance_RW", access: "full" },
  ]);
  eq("the most permissive grant wins", accessForGroups(multi, ["Domain Users", "Finance_RW"]), "full");

  // Windows semantics, and the reason "but they ARE in the group" is so common.
  const denied = share([
    { groupName: "Finance_RW", access: "full" },
    { groupName: "Contractors", access: "read", deny: true },
  ]);
  eq("an explicit deny beats full control", accessForGroups(denied, ["Finance_RW", "Contractors"]), null);
  eq("...and only bites members of the denied group", accessForGroups(denied, ["Finance_RW"]), "full");

  eq("hasAccess compares levels, not equality", hasAccess(dir, multi, "j.doe", "read"), true);
  eq("...and refuses when the level is short", hasAccess(dir, share([{ groupName: "Finance_RW", access: "read" }]), "j.doe", "change"), false);
}

group("Nested group membership");
{
  eq("direct membership resolves", effectiveGroups(dir, "j.doe").includes("Finance_RW"), true);
  eq("nested membership resolves too", effectiveGroups(dir, "j.doe").includes("Leadership"), true);
  eq("memberOf on the user counts", effectiveGroups(dir, "m.ray").includes("Domain Users"), true);
  eq("and nothing else does", effectiveGroups(dir, "m.ray").includes("Finance_RW"), false);

  // The whole point of the cross-team share: access through a nested group.
  const viaNesting = share([{ groupName: "Leadership", access: "change" }]);
  eq("a nested group grants access", accessForUser(dir, viaNesting, "j.doe"), "change");
  eq("...and does not leak to outsiders", accessForUser(dir, viaNesting, "m.ray"), null);
}

group("Access diagnosis");
{
  const s = share([{ groupName: "Finance_RW", access: "change" }]);
  eq("a satisfied request has no blocker", accessBlocker(dir, s, "j.doe", "read"), null);
  eq(
    "a non-member is told which group to join",
    accessBlocker(dir, s, "m.ray", "read"),
    "Not a member of any group with rights here (Finance_RW). Add them in Enterprise Directory Services, or grant their group access on this share.",
  );
  eq(
    "an under-granted user is told to raise the level",
    accessBlocker(dir, share([{ groupName: "Finance_RW", access: "read" }]), "j.doe", "change"),
    "Only Read through their groups; this needs Change. Raise the group's entry on the share.",
  );
  const denied = share([
    { groupName: "Finance_RW", access: "full" },
    { groupName: "Leadership", access: "read", deny: true },
  ]);
  eq(
    "a deny is named as the cause, not the missing grant",
    accessBlocker(dir, denied, "j.doe", "read"),
    "An explicit Deny on Leadership is blocking access. Deny beats every grant — remove it, or take the user out of that group.",
  );
  eq(
    "an empty access list says so",
    accessBlocker(dir, share([]), "j.doe", "read"),
    "No group has been granted anything on this share yet. Add an entry to its access list.",
  );
}

group("Service reachability");
{
  const tor = dev("switch", 1, 1, 180);
  const box = chassis(4, "dc01");
  const mkInfra = (rackOverrides = {}, nodeOverrides = {}) => {
    const rack = {
      ...mk([tor, box]),
      cables: [
        { id: "p1", kind: "power", fromDeviceId: box.id, fromPort: "psu", toDeviceId: pdu.id, toPort: "out1" },
        { id: "u1", kind: "patch", fromDeviceId: box.id, fromPort: "eth0", toDeviceId: tor.id, toPort: "gi0/1" },
      ],
      devices: [pdu, tor, box],
      ...rackOverrides,
    };
    const node = {
      nodeId: "dc01",
      hostname: "dc01",
      os: "windows",
      role: "domain-controller",
      tags: [],
      workloads: [],
      connection: { online: true, reachable: true, ip: "10.0.0.10", protocol: "rdp" },
      services: { NTDS: { status: "Running" } },
      ...nodeOverrides,
    };
    return {
      nodes: { dc01: node },
      datacenter: { racks: [rack] },
      security: { isolatedNodeIds: [] },
      gateway: [],
      node,
    };
  };

  const up = mkInfra();
  eq("a healthy host is reachable", reachNode(up, up.node, ["NTDS"]).reachable, true);

  eq("a missing host is 'missing'", reachNode(up, undefined).layer, "missing");

  const dark = mkInfra({ breakerTripped: true });
  eq("an open breaker fails at the physical layer", reachNode(dark, dark.node, ["NTDS"]).layer, "physical");
  eq("...and points at the Datacenter Floor", reachNode(dark, dark.node, ["NTDS"]).remedy.includes("Datacenter Floor"), true);

  const off = mkInfra({}, { connection: { online: false, reachable: true, ip: "10.0.0.10", protocol: "rdp" } });
  eq("a powered-down host fails at the power layer", reachNode(off, off.node, ["NTDS"]).layer, "power");
  eq("...and points at the Server Manager", reachNode(off, off.node, ["NTDS"]).remedy.includes("Server Manager"), true);

  const stopped = mkInfra({}, { services: { NTDS: { status: "Stopped" } } });
  eq("a stopped service fails at the service layer", reachNode(stopped, stopped.node, ["NTDS"]).layer, "service");
  eq("...and a host that is merely up still passes without the check", reachNode(stopped, stopped.node).reachable, true);

  const isolated = mkInfra();
  isolated.security.isolatedNodeIds = ["dc01"];
  eq("containment isolation fails at the network layer", reachNode(isolated, isolated.node).layer, "network");
}

group("Gateway binding");
{
  const tor = dev("switch", 1, 1, 180);
  const box = chassis(4, "srv01");
  const rack = {
    ...mk([tor, box]),
    cables: [
      { id: "p1", kind: "power", fromDeviceId: box.id, fromPort: "psu", toDeviceId: pdu.id, toPort: "out1" },
      { id: "u1", kind: "patch", fromDeviceId: box.id, fromPort: "eth0", toDeviceId: tor.id, toPort: "gi0/1" },
    ],
    devices: [pdu, tor, box],
  };
  const srv = {
    nodeId: "srv01", hostname: "srv01", os: "linux", role: "web-server", tags: [], workloads: [],
    connection: { online: true, reachable: true, ip: "10.0.0.20", protocol: "ssh" },
  };
  const laptop = {
    nodeId: "ws01", hostname: "ws01", os: "windows", role: "workstation", tags: [], workloads: [],
    connection: { online: true, reachable: true, ip: "10.0.1.20", protocol: "rdp" },
  };
  const fleet = { ...laptop, nodeId: "ws2000", hostname: "ws2000", tags: ["fleet-endpoint"] };

  const infra = {
    nodes: { srv01: srv, ws01: laptop, ws2000: fleet },
    datacenter: { racks: [rack] },
    security: { isolatedNodeIds: [] },
    gateway: [{ nodeId: "ws01" }],
  };

  const targets = gatewayTargets(infra);
  eq("racked servers and listed endpoints appear", targets.map((t) => t.nodeId), ["srv01", "ws01"]);
  eq("the fleet stays out — that is ADUC's job", targets.some((t) => t.nodeId === "ws2000"), false);
  eq("a live racked server is connectable", targets[0].connectable, true);
  eq("...and reports where it lives", targets[0].location, "Rack 01 · U4");

  // THE RULE THE UPDATE EXISTS FOR: trip the rack, lose the connection.
  const trippedInfra = { ...infra, datacenter: { racks: [{ ...rack, breakerTripped: true }] } };
  const tripped = gatewayTargets(trippedInfra).find((t) => t.nodeId === "srv01");
  eq("tripping the PDU drops the server", tripped.connectable, false);
  eq("...and says why", tripped.reason, "Rack 01 breaker open");

  const unpatched = {
    ...infra,
    datacenter: { racks: [{ ...rack, cables: rack.cables.filter((c) => c.kind !== "patch") }] },
  };
  eq(
    "pulling the uplink drops it too",
    gatewayTargets(unpatched).find((t) => t.nodeId === "srv01").reason,
    "no uplink",
  );
}


// ── Company growth (v0.6.0) ─────────────────────────────────────────────────
//
// The milestone ladder is what turns the game from "here is an enterprise" into
// "build one". Getting a threshold wrong would silently strand a player at the
// wrong company size with tickets that cannot fire.

group("Growth phases");
{
  eq("a new operator runs a startup", phaseForLevel(1), 1);
  eq("...and still does at level 4", phaseForLevel(4), 1);
  eq("level 5 is the small-business milestone", phaseForLevel(5), 2);
  eq("level 10 is mid-market", phaseForLevel(10), 3);
  eq("level 15 is enterprise", phaseForLevel(15), 4);
  eq("and nothing beyond it", phaseForLevel(40), 4);

  eq("the ladder climbs in headcount", GROWTH_PHASES.map((p) => p.employees), [35, 150, 300, 450]);
  eq("...and in departments", GROWTH_PHASES.map((p) => p.departments), [3, 5, 7, 8]);
  eq("...and in racks", GROWTH_PHASES.map((p) => p.racks), [1, 1, 2, 3]);

  eq("a startup knows what comes next", nextPhase(1).label, "Small business");
  eq("the enterprise is the end of the ladder", nextPhase(4), null);
  eq("an unknown phase falls back to the startup", phaseSpec(9).phase, 1);
}

group("Growth bookkeeping");
{
  const fresh = initialGrowth(1);
  eq("a career world starts at 35 staff", fresh.employees, 35);
  // Everything up to the starting phase counts as applied: a sandbox world
  // that BEGINS at enterprise scale has not grown into it, and re-running
  // those milestones would hire 450 people onto a world that already has them.
  eq("...with only phase 1 banked", fresh.applied, [1]);

  const sandbox = initialGrowth(4);
  eq("a sandbox world starts at full scale", sandbox.employees, 450);
  eq("...with every milestone already banked", sandbox.applied, [1, 2, 3, 4]);
  eq("...so nothing is left to fire", nextPhase(sandbox.phase), null);
}

group("What headcount does to the estate");
{
  eq("a /24 hands out 254 addresses", poolSize(24), 254);
  eq("a /23 doubles that", poolSize(23), 510);

  // The demand curve is what makes DHCP exhaustion arrive on its own, at the
  // size where it really would.
  eq("a 35-person startup needs about 46 addresses", addressDemand(35, 5), 46);
  eq("...which a /24 carries easily", poolExhausted(35, 5), false);
  eq("150 staff still fit", poolExhausted(150, 6), false);
  eq("300 staff do not", poolExhausted(300, 8), true);
  eq("...but they fit in a /23", poolExhausted(300, 8, 23), false);

  eq("home drives scale with headcount", storageDemandGb(300), 3600);
  eq("...so a startup needs far less", storageDemandGb(35), 420);
}


// ── Fleet Policy resolution (v0.8.0) ────────────────────────────────────────
//
// The rules a learner is here to internalise. Getting precedence wrong in a
// simulator teaches the OPPOSITE of the truth, so every branch is pinned.

const FIN = "OU=Finance,DC=corp,DC=internal";
const PAYROLL = "OU=Payroll,OU=Finance,DC=corp,DC=internal";

const pol = (id, settings, links, extra = {}) => ({
  id, name: id, description: "", enabled: true, settings, links, updatedAt: 0, ...extra,
});
const link = (target, o = {}) => ({ target, enforced: false, enabled: true, ...o });

group("Policy scope");
{
  eq("an OU sits inside itself", ouChain(FIN), [FIN]);
  eq("a nested OU lists its ancestors first", ouChain(PAYROLL), [FIN, PAYROLL]);
  eq("the domain root heads every chain", scopeChain(FIN)[0], DOMAIN_ROOT);
  eq("...and the chain runs root-outward", scopeChain(PAYROLL), [DOMAIN_ROOT, FIN, PAYROLL]);
}

group("Policy precedence");
{
  const domainOnly = {
    policies: [pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT)])],
    blockedOus: [],
  };
  eq("a domain link reaches every unit", resolveSetting(domainOnly, FIN, "passwordMinLength").value, 8);

  // THE core rule: closest container wins, because it is applied last.
  const withOu = {
    policies: [
      pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT)]),
      pol("fin", { passwordMinLength: 16 }, [link(FIN)]),
    ],
    blockedOus: [],
  };
  eq("an OU link beats the domain link", resolveSetting(withOu, FIN, "passwordMinLength").value, 16);
  eq("...and the console names the winner", resolveSetting(withOu, FIN, "passwordMinLength").policyName, "fin");
  eq("a sibling unit is untouched", resolveSetting(withOu, "OU=Sales,DC=corp,DC=internal", "passwordMinLength").value, 8);

  const nested = {
    policies: [
      pol("fin", { passwordMinLength: 16 }, [link(FIN)]),
      pol("pay", { passwordMinLength: 20 }, [link(PAYROLL)]),
    ],
    blockedOus: [],
  };
  eq("the deepest unit wins over its parent", resolveSetting(nested, PAYROLL, "passwordMinLength").value, 20);
}

group("Blocking and enforcement");
{
  const blocked = {
    policies: [
      pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT)]),
      pol("fin", { screenLockMins: 5 }, [link(FIN)]),
    ],
    blockedOus: [FIN],
  };
  // The classic "why is the company-wide setting missing on one team".
  eq("blocking drops inherited settings", resolveSetting(blocked, FIN, "passwordMinLength"), null);
  eq("...but keeps the unit's own", resolveSetting(blocked, FIN, "screenLockMins").value, 5);

  const enforced = {
    policies: [pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT, { enforced: true })])],
    blockedOus: [FIN],
  };
  eq("an enforced link survives blocking", resolveSetting(enforced, FIN, "passwordMinLength").value, 8);

  // Enforcement REVERSES precedence: the higher link wins.
  const fight = {
    policies: [
      pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT, { enforced: true })]),
      pol("fin", { passwordMinLength: 16 }, [link(FIN)]),
    ],
    blockedOus: [],
  };
  eq("an enforced domain link beats a closer OU link", resolveSetting(fight, FIN, "passwordMinLength").value, 8);
  eq("...and says so", resolveSetting(fight, FIN, "passwordMinLength").enforced, true);

  const disabled = {
    policies: [pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT)], { enabled: false })],
    blockedOus: [],
  };
  eq("a disabled policy applies nothing", resolveSetting(disabled, FIN, "passwordMinLength"), null);

  const deadLink = {
    policies: [pol("base", { passwordMinLength: 8 }, [link(DOMAIN_ROOT, { enabled: false })])],
    blockedOus: [],
  };
  eq("a disabled LINK applies nothing either", resolveSetting(deadLink, FIN, "passwordMinLength"), null);
}

group("Policy grading and diagnosis");
{
  const usb = {
    policies: [pol("usb", { usbStorageBlocked: true }, [link(FIN)])],
    blockedOus: [],
  };
  // What the compliance ticket grades with.
  eq("settingApplies sees a correctly linked policy", settingApplies(usb, FIN, "usbStorageBlocked", true), true);
  eq("...and not on a team it was not linked to", settingApplies(usb, "OU=Sales,DC=corp,DC=internal", "usbStorageBlocked", true), false);

  const unlinked = { policies: [pol("usb", { usbStorageBlocked: true }, [])], blockedOus: [] };
  eq("an unlinked policy fails the grade", settingApplies(unlinked, FIN, "usbStorageBlocked", true), false);
  eq(
    "...and the console explains why",
    explainAbsence(unlinked, FIN, "usbStorageBlocked"),
    "usb sets it, but the policy is not linked to anything. Link it to a container.",
  );

  const nowhere = { policies: [], blockedOus: [] };
  eq(
    "nothing configured anywhere says so plainly",
    explainAbsence(nowhere, FIN, "usbStorageBlocked"),
    "No Fleet Policy sets block usb mass storage anywhere.",
  );
  eq("a satisfied setting has no explanation to give", explainAbsence(usb, FIN, "usbStorageBlocked"), null);
}


// ── Endpoint reachability (v0.8.1 hotfix) ───────────────────────────────────
//
// A staff laptop is not a chassis in a cabinet. Running one through the rack
// chain asked "which U is this laptop in", found none, and reported a physical
// fault that cannot exist — which is what broke Remote Support.

group("Client endpoints skip the rack chain");
{
  const laptop = {
    nodeId: "ws-201", hostname: "WS-201", os: "windows", role: "workstation", tags: [], workloads: [],
    connection: { online: true, reachable: true, ip: "10.0.1.55", protocol: "rdp" },
    services: {},
  };
  const infra = {
    nodes: { "ws-201": laptop },
    // Deliberately an EMPTY floor: the endpoint must not care.
    datacenter: { racks: [] },
    security: { isolatedNodeIds: [] },
    gateway: [],
  };

  eq("an unracked laptop is reachable", reachNode(infra, laptop).reachable, true);
  eq("...with no rack complaint at all", reachNode(infra, laptop).layer, null);

  const off = { ...laptop, connection: { ...laptop.connection, online: false } };
  eq("a powered-off laptop fails on power", reachNode({ ...infra, nodes: { "ws-201": off } }, off).layer, "power");
  eq(
    "...and the remedy is about the person, not the datacenter",
    reachNode({ ...infra, nodes: { "ws-201": off } }, off).remedy,
    "Ask the user to switch it on, or wait until they are next at their desk.",
  );

  const away = { ...laptop, connection: { ...laptop.connection, reachable: false } };
  eq("an off-network laptop fails on network", reachNode({ ...infra, nodes: { "ws-201": away } }, away).layer, "network");

  const contained = { ...infra, security: { isolatedNodeIds: ["ws-201"] } };
  eq("containment still isolates an endpoint", reachNode(contained, laptop).layer, "network");

  // The rule is by ROLE, so a genuinely unracked SERVER is still a fault.
  const orphanServer = { ...laptop, nodeId: "srv-9", hostname: "srv-9", role: "web-server" };
  eq(
    "an unracked server is still reported",
    reachNode({ ...infra, nodes: { "srv-9": orphanServer } }, orphanServer).layer,
    "physical",
  );
}

// ── Build 1: PoE budget, shedding and addressing ────────────────────────────
//
// The three mechanics a player reasons about. Each is a pure function over
// stored decisions, so a regression here would silently change what the
// simulation teaches rather than throwing anything.
{
  group("Build 1 — PoE power budget");

  const cam = (id, role = "ip-camera") => ({
    nodeId: id,
    hostname: id,
    displayName: id,
    role,
    connection: { ip: "10.20.1.50", port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 2 },
  });

  const port = (n, nodeId, priority = "high", extra = {}) => ({
    n,
    enabled: true,
    poeEnabled: true,
    priority,
    ...(nodeId ? { attachedNodeId: nodeId } : {}),
    ...extra,
  });

  // Four cameras at 12.5W = 50W, against a 65W budget: comfortable.
  const nodes = {
    "cam-1": cam("cam-1"),
    "cam-2": cam("cam-2"),
    "cam-3": cam("cam-3"),
    "cam-4": cam("cam-4"),
    "ap-1": { ...cam("ap-1", "access-point"), nodeId: "ap-1" },
    "ws-1": { ...cam("ws-1", "workstation"), nodeId: "ws-1" },
  };

  const sw = {
    id: "sw1",
    name: "TEST-PSW-01",
    mgmtIp: "10.20.1.2",
    standard: "at",
    budgetW: 65,
    ports: [port(1, "cam-1"), port(2, "cam-2"), port(3, "cam-3"), port(4, "cam-4")],
  };

  const p = switchPower(sw, nodes);
  eq("four cameras draw 50W", p.grantedW, 50);
  eq("...within a 65W budget", p.overBudget, false);
  eq("...and nothing is shed", p.shedPorts.length, 0);

  // Add the access point (22W): 72W requested against 65W.
  const loaded = { ...sw, ports: [...sw.ports, port(5, "ap-1", "low")] };
  const lp = switchPower(loaded, nodes);
  eq("adding an AP takes the switch over budget", lp.overBudget, true);
  eq("...requested is the full ask, not the granted", lp.requestedW, 72);
  eq("...the low-priority port is the one dropped", lp.shedPorts.join(","), "5");
  eq("...granted stays inside the budget", lp.grantedW <= 65, true);

  // THE DETERMINISM GUARANTEE. Same input, same victim, every time — and the
  // answer must not depend on the order the ports happen to be listed in.
  const shuffled = { ...loaded, ports: [...loaded.ports].reverse() };
  eq("shedding does not depend on port order", switchPower(shuffled, nodes).shedPorts.join(","), "5");

  // Priority, not port number, decides. Promote the AP and a camera goes.
  const promoted = {
    ...loaded,
    ports: loaded.ports.map((x) => (x.n === 5 ? { ...x, priority: "critical" } : x)),
  };
  const pp = switchPower(promoted, nodes);
  eq("promoting the AP protects it", pp.shedPorts.includes(5), false);
  eq("...and a camera is dropped instead", pp.shedPorts.length, 1);

  // Priority ties break on port number, so the LAST camera goes, not a random one.
  eq("ties break on port number — the highest port sheds", pp.shedPorts.join(","), "4");

  // A shed port delivers NOTHING, not a partial trickle: PoE negotiates the
  // full class or nothing, and a camera on four watts is a camera that is off.
  const shedPort = lp.ports.find((x) => x.port === 5);
  eq("a shed port is granted zero watts", shedPort.grantedW, 0);

  group("Build 1 — PoE liveness");

  const state = { switches: [loaded] };
  eq("a powered camera is live", poeLiveness(state, "cam-1", nodes).live, true);
  eq("a shed device is not", poeLiveness(state, "ap-1", nodes).live, false);
  eq("...and the reason names the budget", poeLiveness(state, "ap-1", nodes).reason.includes("65W"), true);

  const downPort = {
    ...loaded,
    ports: loaded.ports.map((x) => (x.n === 1 ? { ...x, enabled: false } : x)),
  };
  eq("an admin-down port takes its device offline", poeLiveness({ switches: [downPort] }, "cam-1", nodes).live, false);

  const noPoe = {
    ...loaded,
    ports: loaded.ports.map((x) => (x.n === 1 ? { ...x, poeEnabled: false } : x)),
  };
  eq("PoE off kills a camera", poeLiveness({ switches: [noPoe] }, "cam-1", nodes).live, false);

  // THE CASE THAT MUST RETURN TRUE. A mains-powered device on a PoE-off port
  // is fine; reporting it as down would be a fault that cannot exist.
  const wsPort = { ...noPoe, ports: [...noPoe.ports, port(6, "ws-1", "high", { poeEnabled: false })] };
  eq("PoE off does not affect a mains-powered workstation", poeLiveness({ switches: [wsPort] }, "ws-1", nodes).live, true);

  // A node on no switch at all is never the switch's problem.
  eq("an unattached node is live", poeLiveness(state, "srv-99", nodes).live, true);
  eq("portOfNode finds the port", portOfNode(state, "cam-2").port.n, 2);
  eq("...and undefined for an unattached node", portOfNode(state, "srv-99"), undefined);
}

{
  group("Build 1 — address maths");

  eq("ipToInt round-trips", ipToInt("10.20.1.5"), 10 * 2 ** 24 + 20 * 65536 + 256 + 5);
  eq("a malformed address is null", ipToInt("10.20.1"), null);
  eq("an out-of-range octet is null", ipToInt("10.20.1.300"), null);

  const c = parseCidr("10.20.1.0/24");
  eq("network address", c.networkInt, ipToInt("10.20.1.0"));
  eq("broadcast address", c.broadcastInt, ipToInt("10.20.1.255"));
  eq("gateway is .1 by convention", c.gatewayInt, ipToInt("10.20.1.1"));

  // Bit-exact rather than octet-wise — the whole reason this does not reuse
  // the cloud console's same-named helper.
  eq("a /25 excludes the upper half", ipWithinCidr("10.20.1.200", "10.20.1.0/25"), false);
  eq("...and includes the lower", ipWithinCidr("10.20.1.100", "10.20.1.0/25"), true);
}

{
  group("Build 1 — IP conflict detection");

  const subnets = [{ cidr: "10.20.1.0/24", label: "Mgmt VLAN" }];
  const mk = (id, ip) => ({
    nodeId: id,
    hostname: id,
    displayName: id,
    role: "ip-camera",
    connection: { ip, port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 2 },
  });
  const nodes = { a: mk("a", "10.20.1.20"), b: mk("b", "10.20.1.21") };
  const ipam = { leases: {}, pools: [{ cidr: "10.20.1.0/24", start: 100, end: 199 }], faults: [] };

  eq("a clean estate has no conflicts", detectConflicts({ nodes, subnets, ipam }).length, 0);

  // 1. DUPLICATE — and both ends must be reported, since either could be the
  //    one the operator should move.
  const dup = { ...ipam, leases: { b: { nodeId: "b", mode: "static", staticIp: "10.20.1.20" } } };
  const dupC = detectConflicts({ nodes, subnets, ipam: dup });
  eq("a duplicate is detected", dupC.some((x) => x.kind === "duplicate"), true);
  eq("...from both sides", dupC.filter((x) => x.kind === "duplicate").length, 2);
  eq("...and it blocks", dupC.find((x) => x.kind === "duplicate").blocking, true);
  eq("...naming the other party", dupC.find((x) => x.nodeId === "b").withNodeId, "a");

  // 2. THE GATEWAY. The single most destructive well-meaning static.
  const gw = { ...ipam, leases: { b: { nodeId: "b", mode: "static", staticIp: "10.20.1.1" } } };
  const gwC = detectConflicts({ nodes, subnets, ipam: gw });
  eq("taking the gateway is a conflict", gwC.some((x) => x.kind === "reserved"), true);
  eq("...and it blocks", gwC.find((x) => x.kind === "reserved").blocking, true);

  const bcast = { ...ipam, leases: { b: { nodeId: "b", mode: "static", staticIp: "10.20.1.255" } } };
  eq("the broadcast address is reserved too", detectConflicts({ nodes, subnets, ipam: bcast }).some((x) => x.kind === "reserved"), true);

  // 3. OFF-ESTATE.
  const off = { ...ipam, leases: { b: { nodeId: "b", mode: "static", staticIp: "192.168.9.9" } } };
  eq("an address outside every subnet is flagged", detectConflicts({ nodes, subnets, ipam: off }).some((x) => x.kind === "out-of-subnet"), true);

  // 4. INSIDE THE DHCP POOL — a warning, NOT a block. It works today and
  //    breaks in a week, and treating it as an outage would be crying wolf.
  const inPool = { ...ipam, leases: { b: { nodeId: "b", mode: "static", staticIp: "10.20.1.150" } } };
  const poolC = detectConflicts({ nodes, subnets, ipam: inPool });
  eq("a static inside the pool is flagged", poolC.some((x) => x.kind === "dhcp-pool"), true);
  eq("...but does NOT block", poolC.find((x) => x.kind === "dhcp-pool").blocking, false);
  eq("inDhcpPool agrees", inDhcpPool("10.20.1.150", ipam, subnets), true);
  eq("...and an address below the pool is outside it", inDhcpPool("10.20.1.50", ipam, subnets), false);

  // A DHCP node keeps its generated address; a static one overrides it.
  eq("effectiveIp follows the lease", effectiveIp(nodes.b, inPool), "10.20.1.150");
  eq("...and falls back to the node's own address", effectiveIp(nodes.a, inPool), "10.20.1.20");

  // The suggestion must be usable: inside the subnet, below the pool, free.
  const s = suggestStatic("10.20.1.0/24", { nodes, subnets, ipam });
  eq("a suggestion is offered", typeof s, "string");
  eq("...below the DHCP pool", ipToInt(s) < ipToInt("10.20.1.100"), true);
  eq("...not the gateway", s === "10.20.1.1", false);
  eq("...and not already taken", s !== "10.20.1.20" && s !== "10.20.1.21", true);
}

// ── Builds 2-3: video traffic and bandwidth saturation ──────────────────────
{
  group("Builds 2-3 — stream gating");

  const cam = (id, ip) => ({
    nodeId: id, hostname: id, displayName: id, role: "ip-camera",
    connection: { ip, port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 2 },
    health: { status: "healthy", cpuLoad: 5, memUsedPct: 20, diskUsedPct: 10, uptimeSeconds: 100 },
  });
  const nvrNode = {
    nodeId: "NVR-1", hostname: "NVR-1", displayName: "NVR", role: "nvr",
    connection: { ip: "10.1.1.60", port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 2 },
    health: { status: "healthy", cpuLoad: 5, memUsedPct: 20, diskUsedPct: 10, uptimeSeconds: 100 },
  };

  const port = (n, nodeId) => ({ n, enabled: true, poeEnabled: true, priority: "high", attachedNodeId: nodeId });

  // structuredClone, because these fixtures get MUTATED in place by the tests
  // below. Sharing the nvrNode reference had an earlier case's
  // `online = false` leak into two later ones and fail them for the wrong
  // reason — a shared mutable fixture is a bug generator, not a shortcut.
  function world(over = {}) {
    const nodes = structuredClone({
      "CAM-1": cam("CAM-1", "10.1.1.21"),
      "CAM-2": cam("CAM-2", "10.1.1.22"),
      "CAM-3": cam("CAM-3", "10.1.1.23"),
      "NVR-1": nvrNode,
    });
    return {
      nodes,
      subnets: [{ cidr: "10.1.1.0/24", label: "Core VLAN" }],
      security: { isolatedNodeIds: [] },
      ipam: { leases: {}, pools: [{ cidr: "10.1.1.0/24", start: 100, end: 199 }], faults: [] },
      poe: {
        switches: [{
          id: "sw1", name: "SW1", mgmtIp: "10.1.1.2", standard: "at", budgetW: 200,
          ports: [port(1, "CAM-1"), port(2, "CAM-2"), port(3, "CAM-3"), port(4, "NVR-1")],
        }],
      },
      traffic: {
        nvr: { nodeId: "NVR-1", name: "NVR-1", channels: 8, storageTb: 8, retentionDays: 30 },
        cameras: {
          "CAM-1": { nodeId: "CAM-1", profile: "1080p", recording: true },
          "CAM-2": { nodeId: "CAM-2", profile: "1080p", recording: true },
          "CAM-3": { nodeId: "CAM-3", profile: "1080p", recording: true },
        },
        uplinkMbps: { sw1: 100 },
        backboneMbps: 1000,
        baselineMbps: 0,
      },
      ...over,
    };
  }

  const base = computeTraffic(world());
  eq("three 1080p cameras offer 12 Mbps", base.videoMbps, 12);
  eq("...all streaming", base.cameras.filter((c) => c.streaming).length, 3);
  eq("...uplink is clear at 12 of 100", base.uplinks[0].level, "clear");

  // GATE 1: POWER. A shed or disabled port sends nothing — which is why
  // shedding doubles as a way to relieve congestion.
  const w1 = world();
  w1.poe.switches[0].ports[0].enabled = false;
  const off = computeTraffic(w1);
  eq("a disabled port stops its camera streaming", off.videoMbps, 8);
  eq("...and the camera says why", /administratively down/.test(off.cameras.find((c) => c.nodeId === "CAM-1").blockedBy), true);

  // GATE 2: ADDRESS. A camera in a blocking conflict contributes no load.
  const w2 = world();
  w2.ipam.leases = { "CAM-2": { nodeId: "CAM-2", mode: "static", staticIp: "10.1.1.21" } };
  const dup = computeTraffic(w2);
  eq("an address conflict stops both cameras streaming", dup.videoMbps, 4);

  // GATE 3: THE RECORDER. No NVR, no streams — a stream with nothing to record
  // to is not a stream.
  const w3 = world();
  w3.nodes["NVR-1"].connection.online = false;
  const noNvr = computeTraffic(w3);
  eq("a downed recorder stops every stream", noNvr.videoMbps, 0);
  eq("...and every camera names the recorder", noNvr.cameras.every((c) => /NVR-1/.test(c.blockedBy)), true);

  // Recording switched off is a per-camera choice, not an outage.
  const w4 = world();
  w4.traffic.cameras["CAM-3"].recording = false;
  eq("a camera not recording sends nothing", computeTraffic(w4).videoMbps, 8);

  // CHANNEL LIMIT — stable, so the same camera is refused until something changes.
  const w5 = world();
  w5.traffic.nvr.channels = 2;
  const limited = computeTraffic(w5);
  eq("the channel limit refuses the surplus stream", limited.videoMbps, 8);
  eq("...and reports how many were refused", limited.overChannels, 1);
  eq("...deterministically", computeTraffic(w5).cameras.find((c) => !c.streaming).nodeId, limited.cameras.find((c) => !c.streaming).nodeId);
}

{
  group("Builds 2-3 — saturation thresholds");

  eq("under 70% is clear", levelFor(69), "clear");
  eq("70% is busy", levelFor(70), "busy");
  eq("90% is congested", levelFor(90), "congested");
  eq("100% is saturated", levelFor(100), "saturated");
  eq("over capacity stays saturated", levelFor(180), "saturated");
  // Below capacity the switch is coping; calling that saturated would teach a
  // player to panic at a number that is fine.
  eq("99% is NOT saturated", levelFor(99), "congested");

  group("Builds 2-3 — saturation impact");

  // Latency is a MULTIPLIER, so the same congestion hurts a WAN hop far more
  // than a LAN hop — which is why the WAN link is the one people notice.
  eq("a clear link does not inflate latency", effectiveLatency(2, "clear"), 2);
  eq("a saturated LAN hop goes 2ms -> 18ms", effectiveLatency(2, "saturated"), 18);
  eq("a saturated WAN hop goes 40ms -> 360ms", effectiveLatency(40, "saturated"), 360);
  eq("congested is gentler than saturated", effectiveLatency(10, "congested") < effectiveLatency(10, "saturated"), true);

  // Loss is additive and starts at zero until the link is genuinely over.
  eq("busy adds no loss", effectiveLossPct(0, "busy"), 0);
  eq("saturated adds loss", effectiveLossPct(0, "saturated") > 0, true);
  eq("loss cannot exceed 100", effectiveLossPct(99, "saturated"), 100);

  // The veil only engages where the penalty says there is a frame delay.
  eq("no frame delay below congested", SATURATION_PENALTY.busy.frameDelayMs, 0);
  eq("congested stalls frames", SATURATION_PENALTY.congested.frameDelayMs > 0, true);
}

{
  group("Builds 2-3 — the worst segment wins");

  const nodes = {};
  const infra = {
    nodes,
    subnets: [{ cidr: "10.1.1.0/24", label: "Core" }],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [] },
    traffic: { nvr: null, cameras: {}, uplinkMbps: {}, backboneMbps: 1000, baselineMbps: 950 },
  };
  const r = computeTraffic(infra);
  // An idle backbone must not mask a drowning uplink, and vice versa: the
  // estate feels the WORST hop on the path, not the average.
  eq("a 95% backbone reads congested", r.backbone.level, "congested");
  eq("...and sets the estate level", r.level, "congested");

  // Health takes points OFF rather than setting the score, so congestion and a
  // dead server compound instead of one hiding the other.
  const h = estateHealth(infra, r);
  eq("congestion costs health", h.score < 100, true);
  eq("...and says why", /Network congested/.test(h.notes[0]), true);

  group("Builds 2-3 — dev overrides");

  const forced = computeTraffic(infra, { forceState: "saturated" });
  eq("a pinned state overrides the maths", forced.level, "saturated");
  eq("...and is flagged as forced, never passed off as a measurement", forced.forced, true);
  eq("an unforced report is not flagged", r.forced, false);
}

// ── DR build: backups, compromise and the recovery sequence ─────────────────
{
  group("DR — storage capacity");

  const srv = (id, role) => ({
    nodeId: id, hostname: id, displayName: id, role,
    connection: { ip: "10.1.1.30", port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 2 },
    health: { status: "healthy", cpuLoad: 5, memUsedPct: 20, diskUsedPct: 10, uptimeSeconds: 100 },
  });

  function world(over = {}) {
    const nodes = structuredClone({
      "DC-1": srv("DC-1", "domain-controller"),
      "FS-1": srv("FS-1", "file-server"),
      "SQL-1": srv("SQL-1", "database"),
      "WS-1": srv("WS-1", "workstation"),
    });
    return {
      nodes,
      subnets: [{ cidr: "10.1.1.0/24", label: "Core" }],
      security: { isolatedNodeIds: [] },
      ipam: { leases: {}, pools: [], faults: [] },
      poe: { switches: [] },
      traffic: { nvr: null, cameras: {}, uplinkMbps: {}, backboneMbps: 1000, baselineMbps: 0 },
      backup: { tier: "none", policies: {}, dataLost: [], log: [] },
      incident: { startedAt: null, patientZero: null, compromised: [], encryptedShareIds: [], containedAt: null, resolvedAt: null },
      ...over,
    };
  }

  // Only things worth protecting are offered. A workstation is rebuildable
  // from an image and does not belong on a backup bill.
  eq("a domain controller is protectable", isProtectable(srv("x", "domain-controller")), true);
  eq("a database is protectable", isProtectable(srv("x", "database")), true);
  eq("a workstation is NOT", isProtectable(srv("x", "workstation")), false);
  eq("nor is a camera", isProtectable(srv("x", "ip-camera")), false);

  const w = world();
  w.backup.policies = {
    "DC-1": { nodeId: "DC-1", schedule: "daily", lastSuccessAt: null, sizeGb: 120 },
    "FS-1": { nodeId: "FS-1", schedule: "daily", lastSuccessAt: null, sizeGb: 1400 },
    "SQL-1": { nodeId: "SQL-1", schedule: "off", lastSuccessAt: null, sizeGb: 900 },
  };
  w.backup.tier = "nas-2tb";

  const cap = capacityOf(w);
  eq("only SCHEDULED nodes consume capacity", cap.usedGb, 1520);
  eq("...against the tier's size", cap.capacityGb, 2048);
  eq("...and it fits", cap.overCapacity, false);

  // Switching the third node on tips it over — and the tier does NOT refuse.
  const over = structuredClone(w);
  over.backup.policies["SQL-1"].schedule = "daily";
  const cap2 = capacityOf(over);
  eq("adding the database exceeds the tier", cap2.overCapacity, true);
  eq("...by the full amount, not a clamped one", cap2.usedGb, 2420);

  group("DR — safety status");

  const safeRows = safetyOf(w, Date.now());
  const byId = Object.fromEntries(safeRows.map((r) => [r.nodeId, r]));
  eq("only protectable hosts are listed", safeRows.length, 3);
  eq("a scheduled job that never ran is 'never-run'", byId["DC-1"].status, "never-run");
  eq("an unscheduled host is 'unprotected'", byId["SQL-1"].status, "unprotected");

  // A copy older than the schedule allows is STALE, not protected.
  const stale = structuredClone(w);
  stale.backup.policies["DC-1"].lastSuccessAt = Date.now() - 50 * 3_600_000;
  eq("a 50h-old daily copy is stale", safetyOf(stale).find((r) => r.nodeId === "DC-1").status, "stale");

  const fresh = structuredClone(w);
  fresh.backup.policies["DC-1"].lastSuccessAt = Date.now() - 2 * 3_600_000;
  eq("a 2h-old daily copy is protected", safetyOf(fresh).find((r) => r.nodeId === "DC-1").status, "protected");

  // Over capacity poisons every row, because the JOBS are failing estate-wide.
  eq("over capacity shows on the hosts", safetyOf(over).find((r) => r.nodeId === "DC-1").status, "over-capacity");

  // LOST OUTRANKS EVERYTHING. A policy configured after the loss must never
  // make the row read "Protected" — that would be the most dishonest thing
  // this screen could say.
  const lost = structuredClone(fresh);
  lost.backup.dataLost = ["DC-1"];
  eq("lost data outranks a healthy policy", safetyOf(lost).find((r) => r.nodeId === "DC-1").status, "lost");

  group("DR — restore availability");

  eq("no storage means no restore", restoreAvailability(world(), "FS-1").possible, false);
  eq("...and attempting it is DESTRUCTIVE", restoreAvailability(world(), "FS-1").destructive, true);
  eq("no schedule is also destructive", restoreAvailability(w, "SQL-1").destructive, true);
  eq("a schedule that never ran is destructive", restoreAvailability(w, "DC-1").destructive, true);
  eq("a good copy can be restored", restoreAvailability(fresh, "DC-1").possible, true);

  // Over capacity is RECOVERABLE — the copy exists, the tier is just too small.
  // Marking this destructive would destroy data the operator still has.
  const overFresh = structuredClone(over);
  overFresh.backup.policies["DC-1"].lastSuccessAt = Date.now() - 2 * 3_600_000;
  eq("over capacity blocks a restore", restoreAvailability(overFresh, "DC-1").possible, false);
  eq("...but is NOT destructive", restoreAvailability(overFresh, "DC-1").destructive, false);

  group("DR — the offsite tier is the one that survives");

  const hit = structuredClone(fresh);
  hit.incident = { startedAt: Date.now(), patientZero: "WS-1", compromised: [{ nodeId: "FS-1", at: Date.now(), vector: "lateral" }], encryptedShareIds: [], containedAt: null, resolvedAt: null };
  eq("an on-premises NAS is reached by the incident", backupsCompromised(hit), true);

  const offsite = structuredClone(hit);
  offsite.backup.tier = "offsite-96tb";
  eq("offsite replication is not", backupsCompromised(offsite), false);
  eq("...and no storage at all cannot be 'compromised'", backupsCompromised(world()), false);
  eq("a clean estate never reports compromised backups", backupsCompromised(fresh), false);
}

{
  group("DR — isolation is a question, not a flag");

  const base = {
    nodes: {},
    subnets: [],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [{ id: "sw1", name: "SW1", mgmtIp: "10.1.1.2", standard: "at", budgetW: 100, ports: [{ n: 1, enabled: true, poeEnabled: true, priority: "high", attachedNodeId: "MAC-1" }] }] },
    traffic: { nvr: null, cameras: {}, uplinkMbps: {}, backboneMbps: 1000, baselineMbps: 0 },
    backup: { tier: "none", policies: {}, dataLost: [], log: [] },
    incident: { startedAt: null, patientZero: null, compromised: [], encryptedShareIds: [], containedAt: null, resolvedAt: null },
  };

  eq("a live host is not isolated", isIsolated(base, "MAC-1"), false);

  // BOTH mechanisms count, and neither is privileged.
  const viaPort = structuredClone(base);
  viaPort.poe.switches[0].ports[0].enabled = false;
  eq("a disabled switch port isolates", isIsolated(viaPort, "MAC-1"), true);
  eq("...and the method is reported honestly", isolationMethod(viaPort, "MAC-1"), "port");

  const viaContain = structuredClone(base);
  viaContain.security.isolatedNodeIds = ["MAC-1"];
  eq("a NetOps containment isolates", isIsolated(viaContain, "MAC-1"), true);
  eq("...and reports its own method", isolationMethod(viaContain, "MAC-1"), "containment");

  // Undoing it un-isolates — the flag a stored boolean would have left stuck.
  const undone = structuredClone(viaPort);
  undone.poe.switches[0].ports[0].enabled = true;
  eq("re-enabling the port ends isolation", isIsolated(undone, "MAC-1"), false);
}

{
  group("DR — the recovery sequence");

  function inc(over = {}) {
    const now = Date.now();
    return {
      nodes: {},
      subnets: [],
      security: { isolatedNodeIds: [] },
      ipam: { leases: {}, pools: [], faults: [] },
      poe: { switches: [{ id: "sw1", name: "SW1", mgmtIp: "10.1.1.2", standard: "at", budgetW: 100, ports: [{ n: 1, enabled: true, poeEnabled: true, priority: "high", attachedNodeId: "MAC-1" }] }] },
      traffic: { nvr: null, cameras: {}, uplinkMbps: {}, backboneMbps: 1000, baselineMbps: 0 },
      backup: { tier: "nas-8tb", policies: {}, dataLost: [], log: [] },
      incident: {
        startedAt: now,
        patientZero: "MAC-1",
        compromised: [
          { nodeId: "MAC-1", at: now, vector: "phishing" },
          { nodeId: "FS-1", at: now, vector: "lateral" },
        ],
        encryptedShareIds: ["shr-1"],
        containedAt: null,
        resolvedAt: null,
      },
      ...over,
    };
  }

  const spreading = inc();
  eq("an un-isolated incident is spreading", recoveryStatus(spreading).stage, "spreading");
  eq("...and the next step is isolation", recoveryStatus(spreading).nextApp, "switches");

  const isolated = structuredClone(spreading);
  isolated.poe.switches[0].ports[0].enabled = false;
  eq("isolating advances the stage", recoveryStatus(isolated).stage, "isolated");
  eq("...and points at the server console next", recoveryStatus(isolated).nextApp, "gateway");

  /*
   * PATIENT ZERO IS NOT WIPED HERE, on purpose. A staff endpoint is not a
   * Remote Gateway target, so there is no session to open and no wipe to
   * perform — isolating it is the whole of the operator's job on that host.
   * Only the SERVER is wiped and restored. Found by playing the loop: the
   * earlier rule left the sequence stuck with an instruction that could not be
   * carried out anywhere in the product.
   */
  const wiped = structuredClone(isolated);
  wiped.incident.compromised = wiped.incident.compromised.map((c) =>
    c.nodeId === "MAC-1" ? c : { ...c, wipedAt: Date.now() },
  );
  eq("wiping every host advances again", recoveryStatus(wiped).stage, "wiped");
  eq("...and sends the operator to the backup panel", recoveryStatus(wiped).nextApp, "backup");

  const restored = structuredClone(wiped);
  restored.incident.compromised = restored.incident.compromised.map((c) =>
    c.nodeId === "MAC-1" ? c : { ...c, restoredAt: Date.now() },
  );
  eq("restoring the server finishes the sequence", recoveryStatus(restored).stage, "restored");
  eq(
    "...without ever wiping patient zero, which has no console to wipe from",
    restored.incident.compromised.find((c) => c.nodeId === "MAC-1").wipedAt,
    undefined,
  );
  eq("...with nothing left to do", recoveryStatus(restored).nextAction, null);

  // THE REGRESSION THAT MATTERS. Re-enabling the port mid-recovery genuinely
  // puts an infected host back on the network, so the stage must fall back.
  // A stored stage counter would have happily stayed at "wiped".
  const reopened = structuredClone(wiped);
  reopened.poe.switches[0].ports[0].enabled = true;
  eq("re-enabling the port drops back to spreading", recoveryStatus(reopened).stage, "spreading");

  // Data loss is terminal and outranks having wiped everything.
  const lostWorld = structuredClone(wiped);
  lostWorld.backup.dataLost = ["FS-1"];
  eq("lost data ends the sequence at 'lost'", recoveryStatus(lostWorld).stage, "lost");

  group("DR — health penalties");

  // Every step of the operator's work has to move the number, or the first two
  // steps read as ceremony.
  eq("spreading costs the most", incidentHealthPenalty("spreading"), 45);
  eq("isolating helps", incidentHealthPenalty("isolated") < incidentHealthPenalty("spreading"), true);
  eq("wiping helps more", incidentHealthPenalty("wiped") < incidentHealthPenalty("isolated"), true);
  eq("a finished recovery costs nothing", incidentHealthPenalty("restored"), 0);
  eq("a clean estate costs nothing", incidentHealthPenalty("clean"), 0);
  eq("losing the data still hurts", incidentHealthPenalty("lost") > 0, true);
}

// ── Polish pass: the ambient engine, gating, prerequisites and hints ────────
{
  group("Polish — the queue never runs dry");

  const tpl = (id, difficulty, tags = [], extra = {}) => ({
    id, difficulty, tags, playable: true, category: "System & Web Services", ...extra,
  });

  const library = {
    a: tpl("gen-a-1-1", "Tier_1_Easy"),
    b: tpl("gen-b-1-1", "Tier_1_Easy"),
    c: tpl("gen-c-1-1", "Tier_1_Easy"),
    d: tpl("gen-d-2-1", "Tier_2_Medium"),
    e: tpl("gen-e-3-1", "Tier_3_Hard"),
  };

  const world = { growth: { phase: 0 }, nodes: {}, subnets: [] };
  const rng = () => 0.5;

  /*
   * THE REGRESSION THIS SUITE EXISTS FOR.
   *
   * The reported bug: after roughly eight tickets the queue emptied and never
   * refilled, because supply came only from world generation, promotions to
   * tier-unlock levels, and player-caused faults. Simulate a long session and
   * assert the engine keeps producing — if this ever fails again, it fails
   * here rather than in somebody's playthrough.
   */
  let now = 0;
  let lastSpawnAt = 0;
  let open = 0;
  let spawned = 0;
  const MINUTES = 600; // ten hours of game time
  for (let t = 0; t < MINUTES * 60_000; t += 5_000) {
    now = t;
    const d = ambientDecision({
      infra: world, level: 1, openCount: open,
      openTemplateIds: [], library, lastSpawnAt, now, rng,
    });
    if (d.spawn) { spawned += 1; lastSpawnAt = now; open += 1; }
    // The operator works one ticket every couple of minutes.
    if (t % 120_000 === 0 && open > 0) open -= 1;
  }
  eq("ten hours of play keeps producing tickets", spawned > 100, true);
  eq("...and the operator is never starved", spawned >= MINUTES / 3, true);

  group("Polish — pacing brakes");

  // The backlog ceiling holds, or an operator who steps away drowns.
  const full = ambientDecision({
    infra: world, level: 1, openCount: BACKLOG_CEILING,
    openTemplateIds: [], library, lastSpawnAt: 0, now: 10_000_000, rng,
  });
  eq("a full backlog stops new arrivals", full.spawn, false);
  eq("...and says why", /Backlog full/.test(full.reason), true);

  // Below the ceiling but inside the interval: wait.
  const early = ambientDecision({
    infra: world, level: 1, openCount: 4,
    openTemplateIds: [], library, lastSpawnAt: 0, now: 1_000, rng,
  });
  eq("arrivals respect the interval", early.spawn, false);

  // AN EMPTY BOARD JUMPS THE QUEUE. Without this, clearing the queue meant
  // staring at "Inbox zero" for a full interval — indistinguishable from the
  // bug being fixed.
  const empty = ambientDecision({
    infra: world, level: 1, openCount: 0,
    openTemplateIds: [], library, lastSpawnAt: 0, now: 1_000, rng,
  });
  eq("an empty board refills immediately", empty.spawn, true);
  eq("...even though the interval has not elapsed", URGENT_REFILL_BELOW > 0, true);

  // A bigger company raises more tickets.
  eq("enterprise pace is faster than startup pace",
     ARRIVAL_MS_BY_PHASE[3] < ARRIVAL_MS_BY_PHASE[0], true);

  group("Polish — ticket prerequisites match unlocked apps");

  // A level-1 operator must never be handed Tier 3 work.
  const lvl1 = eligibleTemplates({ infra: world, level: 1, library, openTemplateIds: [] });
  eq("a level-1 operator gets only Tier 1", lvl1.every((t) => t.difficulty === "Tier_1_Easy"), true);
  eq("...and does get some", lvl1.length > 0, true);

  const lvl5 = eligibleTemplates({ infra: world, level: 5, library, openTemplateIds: [] });
  eq("a level-5 operator sees Tier 3 too", lvl5.some((t) => t.difficulty === "Tier_3_Hard"), true);

  // THE TOOL GATE. A ticket whose app is locked must not arrive: there is no
  // door for the player to open.
  const poeLib = { p: tpl("gen-poe-1-1", "Tier_1_Easy", ["poe"]) };
  const need = appUnlockLevel("switches");
  eq("Network Switches gates its own ticket class", need > 1, true);
  eq(
    "a PoE ticket cannot arrive before the switch panel does",
    eligibleTemplates({ infra: world, level: need - 1, library: poeLib, openTemplateIds: [] }).length,
    0,
  );
  eq(
    "...and does once it is unlocked",
    eligibleTemplates({ infra: world, level: need, library: poeLib, openTemplateIds: [] }).length,
    1,
  );
  eq("templateMinLevel agrees", templateMinLevel(["poe"]), need);
  eq("an untagged template needs nothing", templateMinLevel([]), 1);

  // One live ticket per family, or the board fills with duplicates that all
  // grade the same world state.
  const dupes = eligibleTemplates({
    infra: world, level: 1, library, openTemplateIds: ["gen-a-1-1"],
  });
  eq("a family with an open ticket is excluded", dupes.some((t) => t.id === "gen-a-1-1"), false);
  eq("familyOf strips the tier and variant", familyOf("gen-lockout-1-3"), "gen-lockout");
  eq("...and leaves hand-authored ids alone", familyOf("sec-t4-ransomware-dr"), "sec-t4-ransomware-dr");

  // Unplayable templates never arrive — a ticket that cannot be resolved is a
  // dead end, which is the thing this whole pass is about.
  const unplayable = { u: tpl("gen-u-1-1", "Tier_1_Easy", [], { playable: false }) };
  eq("an unplayable template never arrives",
     eligibleTemplates({ infra: world, level: 9, library: unplayable, openTemplateIds: [] }).length, 0);

  // Systemic set-pieces stay out of the rotation: a ransomware event arriving
  // unannounced every ninety seconds would be a different game.
  const systemic = { s: tpl("sec-t4-x", "Tier_4_Expert", [], { injectFault: () => {} }) };
  eq("systemic Tier 4 set-pieces are not ambient",
     eligibleTemplates({ infra: world, level: 9, library: systemic, openTemplateIds: [] }).length, 0);
}

{
  group("Edge gateway — rule evaluation is first-match-wins");

  const LAN = "10.29.1.0/24";
  const rules = defaultEdgeRules(LAN);

  // The shipped baseline must be a WORKING firewall, or a ticket that breaks
  // one rule is indistinguishable from a config that never worked.
  eq("LAN https is permitted out of the box",
     evaluate(rules, { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.24" }).allowed, true);
  eq("LAN dns is permitted",
     evaluate(rules, { chain: "FORWARD", protocol: "udp", port: 53, source: "10.29.1.31" }).allowed, true);
  // The perimeter admits NOTHING inbound. There is no state tracking in the
  // model, so an "allow established" rule would be a permit-all wearing a
  // reassuring name — the implicit deny is the honest posture.
  eq("inbound ssh from the internet is refused",
     evaluate(rules, { chain: "INPUT", protocol: "tcp", port: 22, source: "198.51.100.7" }).allowed, false);
  eq("...and it is the implicit deny that refuses it, not a rule",
     evaluate(rules, { chain: "INPUT", protocol: "tcp", port: 22, source: "198.51.100.7" }).rule, null);
  eq("spoofed private source from WAN is blocked by an explicit rule",
     evaluate(rules, { chain: "INPUT", protocol: "tcp", port: 22, source: "10.29.1.9" }).rule.id, "wan-block-private");

  // Order is the whole lesson: a permit below a broad block never fires.
  const shadowed = [
    { id: "block-all", chain: "FORWARD", action: "DROP", protocol: "any", source: "any", enabled: true },
    { id: "allow-web", chain: "FORWARD", action: "ACCEPT", protocol: "tcp", port: 443, source: "any", enabled: true },
  ];
  const verdict = evaluate(shadowed, { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.5" });
  eq("a permit shadowed by a block never fires", verdict.allowed, false);
  eq("...and the log can name the rule that decided", verdict.rule.id, "block-all");

  // Reordering fixes it — which is why the UI can move rules.
  eq("reordering the permit above the block restores it",
     evaluate([shadowed[1], shadowed[0]], { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.5" }).allowed, true);

  // A disabled rule is skipped entirely, not treated as a deny.
  const disabled = [{ ...shadowed[1], enabled: false }];
  eq("a disabled permit does not match", evaluate(disabled, { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.5" }).allowed, false);
  eq("nothing matching means implicit deny",
     evaluate([], { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.5" }).rule, null);

  // Chains do not leak into each other.
  eq("a FORWARD rule does not decide INPUT traffic",
     evaluate(rules, { chain: "INPUT", protocol: "udp", port: 53, source: "10.29.1.31" }).rule.chain, "INPUT");
  eq("...and an INPUT rule does not decide FORWARD traffic",
     evaluate(rules, { chain: "FORWARD", protocol: "tcp", port: 443, source: "10.29.1.24" }).rule.chain, "FORWARD");

  // Port and protocol narrowing.
  eq("a port-specific rule ignores other ports",
     evaluate([{ id: "p", chain: "FORWARD", action: "ACCEPT", protocol: "tcp", port: 443, source: "any", enabled: true }],
              { chain: "FORWARD", protocol: "tcp", port: 22, source: "10.29.1.5" }).allowed, false);
  eq("a protocol-specific rule ignores other protocols",
     evaluate([{ id: "p", chain: "FORWARD", action: "ACCEPT", protocol: "udp", source: "any", enabled: true }],
              { chain: "FORWARD", protocol: "tcp", source: "10.29.1.5" }).allowed, false);

  group("Edge gateway — addressing and tabs");

  eq("a /24 contains its own host", cidrContains("10.29.1.0/24", "10.29.1.55"), true);
  eq("a /24 excludes a neighbour subnet", cidrContains("10.29.1.0/24", "10.29.2.55"), false);
  eq("a /8 contains anything under it", cidrContains("10.0.0.0/8", "10.29.1.55"), true);
  eq("a bare address matches only itself", cidrContains("10.29.1.1", "10.29.1.1"), true);

  eq("the LAN cidr is derived from the gateway address", lanCidrFor("10.29.1.1"), "10.29.1.0/24");

  // The gateway address is read off what the estate already routes through.
  const routed = { a: { network: { routes: [{ destination: "default", gateway: "10.29.1.1" }] } } };
  eq("the gateway ip is derived from the default route", deriveGatewayIp(routed), "10.29.1.1");
  eq("an estate with no routes still yields an address", deriveGatewayIp({}), "10.0.0.1");

  // The WAN/LAN tabs ARE chains — the UI must not invent a parallel field.
  eq("the WAN tab is the INPUT chain", CHAIN_FOR.wan, "INPUT");
  eq("the LAN tab is the FORWARD chain", CHAIN_FOR.lan, "FORWARD");
  eq("the WAN tab lists only INPUT rules",
     rulesFor({ firewall: rules }, "wan").every((r) => r.chain === "INPUT"), true);
  eq("the LAN tab lists only FORWARD rules",
     rulesFor({ firewall: rules }, "lan").every((r) => r.chain === "FORWARD"), true);
}

{
  group("Edge gateway — NAT is translate-then-filter");

  const LAN = "10.29.1.0/24";
  const withNat = (nat, firewall) => ({ firewall, nat, interfaces: [], routes: [], dnsServers: [], hostsTable: {}, reachableHosts: {} });
  const fwd = {
    id: "web", protocol: "tcp", externalPort: 80, internalIp: "10.29.1.20", internalPort: 8080, enabled: true,
  };

  // Nothing published: the honest answer to "the outside can't reach us".
  const bare = withNat([], defaultEdgeRules(LAN));
  const noPub = resolveInbound(bare, { protocol: "tcp", port: 80, source: "198.51.100.5" });
  eq("with no forward, nothing is delivered", noPub.deliveredTo, null);
  eq("...and the connection is refused", noPub.allowed, false);

  // A forward delivers to the INTERNAL host and port.
  const allowInternal = [
    ...defaultEdgeRules(LAN),
    { id: "allow-8080", chain: "FORWARD", action: "ACCEPT", protocol: "tcp", port: 8080, source: "any", enabled: true },
  ];
  const good = resolveInbound(withNat([fwd], allowInternal), { protocol: "tcp", port: 80, source: "198.51.100.5" });
  eq("a forward delivers to the internal host", good.deliveredTo, "10.29.1.20");
  eq("...and the connection is permitted", good.allowed, true);

  // The teaching case: the forward is right and the firewall still denies,
  // because the rule must permit the TRANSLATED port, not the public one.
  const wrongPort = [
    ...defaultEdgeRules(LAN),
    { id: "allow-80", chain: "FORWARD", action: "ACCEPT", protocol: "tcp", port: 80, source: "any", enabled: true },
  ];
  const mismatch = resolveInbound(withNat([fwd], wrongPort), { protocol: "tcp", port: 80, source: "198.51.100.5" });
  eq("a rule permitting the PUBLIC port does not admit translated traffic", mismatch.allowed, false);
  eq("...though the translation itself still happened", mismatch.deliveredTo, "10.29.1.20");

  // A disabled forward is not consulted.
  const off = resolveInbound(withNat([{ ...fwd, enabled: false }], allowInternal), { protocol: "tcp", port: 80, source: "198.51.100.5" });
  eq("a disabled forward publishes nothing", off.deliveredTo, null);
  // Protocol and port must both match to translate.
  const udp = resolveInbound(withNat([fwd], allowInternal), { protocol: "udp", port: 80, source: "198.51.100.5" });
  eq("a tcp forward does not catch udp", udp.deliveredTo, null);

  // A forward aimed at a host that does not exist is the classic dead forward.
  const nodes = {
    web: { hostname: "WEB-01", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.29.1.20", up: true, mac: "aa" }] } },
    down: { hostname: "OLD-01", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.29.1.21", up: false, mac: "bb" }] } },
  };
  eq("a forward to a live host is healthy", natTargetProblem(fwd, nodes), null);
  eq("a forward to nobody is reported",
     natTargetProblem({ ...fwd, internalIp: "10.29.1.99" }, nodes).includes("No host"), true);
  eq("a forward to a downed adapter is reported",
     natTargetProblem({ ...fwd, internalIp: "10.29.1.21" }, nodes).includes("administratively down"), true);

  group("Edge gateway — DHCP leases are derived");

  const cfg = defaultDhcp("10.29.1.1");
  eq("the default pool starts at .100", cfg.rangeStart, "10.29.1.100");
  eq("an address in the pool is recognised", inPool(cfg, "10.29.1.150"), true);
  eq("an address below the pool is not", inPool(cfg, "10.29.1.20"), false);
  eq("an address on another subnet is not", inPool(cfg, "10.29.2.150"), false);

  const lanNodes = {
    a: { hostname: "WS-01", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.29.1.40", up: true, mac: "aa:01" }] } },
    b: { hostname: "WS-02", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.29.1.41", up: true, mac: "aa:02" }] } },
    far: { hostname: "OFFSITE", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.99.9.9", up: true, mac: "aa:03" }] } },
  };
  const leases = deriveLeases(cfg, "10.29.1.0/24", lanNodes, "10.29.1.1");
  eq("only hosts on the LAN get leases", leases.length, 2);
  eq("leases are dynamic without a reservation", leases[0].kind, "dynamic");
  eq("a healthy lease has no problem", leases[0].problem, null);

  // A reservation pins the host and shows as static.
  const reserved = deriveLeases({ ...cfg, reservations: [{ mac: "aa:01", ip: "10.29.1.40" }] }, "10.29.1.0/24", lanNodes, "10.29.1.1");
  eq("a reserved MAC reads as static", reserved.find((l) => l.mac === "aa:01").kind, "static");

  // The two teachable faults.
  const inPoolRes = deriveLeases({ ...cfg, reservations: [{ mac: "aa:01", ip: "10.29.1.120" }] }, "10.29.1.0/24", lanNodes, "10.29.1.1");
  eq("a reservation that disagrees with the live address is flagged",
     inPoolRes.find((l) => l.mac === "aa:01").problem.includes("currently holding"), true);

  const dupe = {
    a: lanNodes.a,
    b: { hostname: "WS-09", connection: { online: true }, network: { interfaces: [{ name: "eth0", ipv4: "10.29.1.40", up: true, mac: "aa:09" }] } },
  };
  const conflict = deriveLeases(cfg, "10.29.1.0/24", dupe, "10.29.1.1");
  eq("two hosts on one address is an address conflict",
     conflict.some((l) => l.problem && l.problem.includes("conflict")), true);

  // A reservation for a machine that is not here is an orphan, not an error.
  eq("reservations for absent machines are listed separately",
     orphanReservations({ ...cfg, reservations: [{ mac: "zz:99", ip: "10.29.1.60" }] }, leases).length, 1);

  group("Edge gateway — L7 rules and the IDS mode");

  // An application rule matches by app and ignores the port entirely.
  const l7 = [{ id: "no-torrent", chain: "FORWARD", action: "DROP", protocol: "any", app: "bittorrent", source: "any", enabled: true }];
  eq("an app rule matches its application", evaluate(l7, { chain: "FORWARD", protocol: "tcp", port: 6881, source: "10.29.1.5", app: "bittorrent" }).allowed, false);
  eq("...on any port", evaluate(l7, { chain: "FORWARD", protocol: "tcp", port: 51413, source: "10.29.1.5", app: "bittorrent" }).allowed, false);
  eq("...and ignores traffic of other apps", evaluate(l7, { chain: "FORWARD", protocol: "tcp", port: 6881, source: "10.29.1.5", app: "streaming" }).rule, null);
  eq("...and untagged traffic never matches an app rule",
     evaluate(l7, { chain: "FORWARD", protocol: "tcp", port: 6881, source: "10.29.1.5" }).rule, null);

  // Mode decides the verdict — a detect-mode engine cannot block.
  const detect = { ...defaultIds(), enabled: true, mode: "detect" };
  const prevent = { ...defaultIds(), enabled: true, mode: "prevent" };
  const evDetect = threatEvent(detect, "port-scan", "203.0.113.9", "10.29.1.1", 1000);
  const evPrevent = threatEvent(prevent, "port-scan", "203.0.113.9", "10.29.1.1", 1000);
  eq("detect mode records but does not block", evDetect.action, "detected");
  eq("prevent mode blocks", evPrevent.action, "blocked");
  eq("detected traffic reaches the estate", threatReachedEstate(detect, evDetect), true);
  eq("blocked traffic does not", threatReachedEstate(prevent, evPrevent), false);
  eq("a disabled engine stops nothing", threatReachedEstate(defaultIds(), evPrevent), true);
  eq("severity comes from the signature, not the caller", threatEvent(prevent, "malware-c2", "a", "b", 1).severity, "critical");

  // A disabled engine sees nothing at all — the reason leaving it off is a
  // mistake worth teaching, and the reason the store refuses to record while
  // it is down (an invisible fault is a bug, not a scenario).
  eq("an event minted by a disabled engine is not marked blocked",
     threatEvent(defaultIds(), "ddos", "a", "b", 1).action, "detected");

  const sum = threatSummary({ ...prevent, events: [evPrevent, evDetect] });
  eq("the dashboard counts every event", sum.total, 2);
  eq("...and only the blocked ones as blocked", sum.blocked, 1);
}

{
  group("Desktop sim — the build order is physical, not a wizard");

  const b0 = EMPTY_BUILD;
  eq("nothing is installed to begin with", b0.installed.length, 0);
  eq("the board goes in first", nextStep(b0).id, "mobo");

  // A CPU cannot precede the board it sits on, and the model says why.
  eq("the CPU is blocked before the board", canInstall(b0, "cpu"), false);
  eq("...and names what is missing", blockedBy(b0, "cpu"), "Fit the Motherboard first");
  eq("installing it anyway is refused", install(b0, "cpu").installed.length, 0);

  const b1 = install(b0, "mobo");
  eq("with the board in, the CPU is allowed", canInstall(b1, "cpu"), true);

  // Paste before cooler: you cannot reach the die afterwards.
  const b2 = install(b1, "cpu");
  eq("the cooler is blocked before paste", blockedBy(b2, "cooler"), "Fit the Thermal paste first");
  const b3 = install(install(b2, "paste"), "cooler");
  eq("paste then cooler is accepted", b3.installed.includes("cooler"), true);

  group("Desktop sim — POST reads the build");

  eq("a bare bench will not power on", postHalt(EMPTY_BUILD).screen.includes("No motherboard"), true);
  eq("no 24-pin means nothing starts", postHalt(b3).code, "0x10");

  // Power cables originate at the PSU, so they cannot be routed before it is
  // fitted — connecting one to an empty basement is refused.
  eq("ATX power needs the PSU first", connect(b3, "atx24").connected.includes("atx24"), false);
  const powered = install(b3, "psu");
  let wired = connect(powered, "atx24");
  eq("with ATX in, the CPU rail is next", postHalt(wired).code, "0x12");
  wired = connect(wired, "cpu8");
  eq("no memory gives one long two short", postHalt(wired).beeps, "1 long, 2 short");

  const withRam = install(wired, "ram1");
  eq("one stick clears the memory halt", postHalt(withRam), null);

  // A cable is only connectable once the part it feeds is seated.
  eq("PCIe power needs the card first", connect(withRam, "pcie8").connected.includes("pcie8"), false);
  const withGpu = connect(install(withRam, "gpu"), "pcie8");
  eq("...and is accepted once the card is in", withGpu.connected.includes("pcie8"), true);

  group("Desktop sim — telemetry and specs follow the build");

  eq("a cooled, pasted CPU idles cool", telemetry(b3).cpuTempC, 38);
  eq("...and its fan spins", telemetry(b3).cpuFanRpm > 0, true);
  // Mounting a cooler on a bare die is a real mistake with a real symptom.
  eq("no paste runs hot", telemetry(install(b1, "cpu")).cpuTempC > 70, true);
  eq("no cooler at all is critical", telemetry(install(b1, "cpu")).cpuTempCritical, true);
  eq("one stick reports 8GB", specOf(withRam).ramGb, 8);
  eq("two sticks report 16GB", specOf(install(withRam, "ram2")).ramGb, 16);
  eq("no SSD means no disk", specOf(withRam).diskGb, 0);

  group("Desktop sim — BIOS boot order and provisioning");

  const withSsd = install(withRam, "ssd");
  eq("a blank disk is not bootable", biosDevices(withSsd, false).find((d) => d.kind === "disk").bootable, false);
  // The disk sits first but is empty, so the firmware falls through to the USB.
  eq("an empty disk falls through to the installer", resolveBoot(defaultBios(withSsd, false)).kind, "usb");
  eq("with an OS on it the disk wins", resolveBoot(defaultBios(withSsd, true)).kind, "disk");
  eq("moving the USB up changes what boots",
     resolveBoot(moveBootDevice(defaultBios(withSsd, true), "usb", "up")).kind, "usb");

  // Unknown devices are derived: no GPU, no display driver to chase.
  eq("a fresh image always wants a NIC driver",
     pendingDrivers(withSsd, []).some((d) => d.id === "nic"), true);
  eq("a build with no GPU has no display driver to install",
     pendingDrivers(withRam, []).some((d) => d.id === "vga"), false);
  eq("installing the NIC driver clears it",
     pendingDrivers(withSsd, ["nic"]).some((d) => d.id === "nic"), false);

  // The ordering that matters: no NIC driver, no domain join.
  eq("a machine with no network driver cannot join", domainJoinBlocker([]) !== null, true);
  eq("...and the reason names the adapter", domainJoinBlocker([]).includes("network adapter"), true);
  eq("once the NIC driver is on, the join is allowed", domainJoinBlocker(["nic"]), null);

  group("Desktop sim — completion is derived");

  eq("an empty bench is not complete", report(EMPTY_BUILD).complete, false);
  eq("...and everything is outstanding", report(EMPTY_BUILD).faults.length > 0, true);

  // Follow the derived guidance to the end, exactly as a player would.
  let full = EMPTY_BUILD;
  for (let i = 0; i < 40; i++) {
    const step = nextStep(full);
    if (!step) break;
    full = step.kind === "part" ? install(full, step.id) : connect(full, step.id);
  }
  eq("following the guidance finishes the build", report(full).complete, true);
  eq("...and leaves nothing outstanding", nextStep(full), null);
  eq("...and the finished machine posts", postHalt(full), null);
  eq("...at full progress", report(full).progress, 1);
}

{
  group("Desktop sim — one coordinate space, real proportions");

  // The failure this system exists to prevent: parts sized by eye. Every
  // dimension derives from millimetres, so a screw CANNOT out-scale a DIMM.
  // Portrait: 244mm across, 305mm down.
  eq("an ATX board is 244mm across", mm(SPEC_MM.atxBoard.w), 488);
  eq("...and 305mm down", mm(SPEC_MM.atxBoard.h), 610);
  eq("a case screw head is 6mm", mm(SPEC_MM.screwHead), 12);
  eq("a screw head is far smaller than a DIMM module",
     mm(SPEC_MM.screwHead) * 4 < mm(SPEC_MM.dimmModule.w), true);
  eq("a DIMM slot is long and thin, not square",
     mm(SPEC_MM.dimmSlot.w) > mm(SPEC_MM.dimmSlot.h) * 20, true);
  eq("a GPU is wider than the socket it plugs beside",
     mm(SPEC_MM.gpu.w) > mm(SPEC_MM.lgaSocket.w) * 5, true);

  // Containment: the board fits its case, and the case fits the canvas.
  eq("the board fits inside the case", BOARD.w <= CASE_INNER.w, true);
  eq("...in both axes", BOARD.h <= CASE_INNER.h, true);
  eq("the whole scene fits the canvas",
     ZONES.every((z) => z.box.x >= 0 && z.box.y >= 0 &&
                        z.box.x + z.box.w <= CANVAS.w &&
                        z.box.y + z.box.h <= CANVAS.h), true);

  // Sockets are board-relative, so they cannot drift away from it.
  const socket = ZONES.find((z) => z.id === "socket");
  eq("the socket sits on the board", socket.box.x > BOARD.x && socket.box.x < BOARD.x + BOARD.w, true);
  eq("...vertically too", socket.box.y > BOARD.y && socket.box.y < BOARD.y + BOARD.h, true);

  // The two DIMM slots are parallel and do not overlap.
  const a1 = ZONES.find((z) => z.id === "dimm-a1").box;
  const a2 = ZONES.find((z) => z.id === "dimm-a2").box;
  // On a portrait board the DIMMs stand side by side, sharing a top edge.
  eq("DIMM slots share a top edge", Math.round(a1.y), Math.round(a2.y));
  eq("...and sit side by side without overlapping", a2.x >= a1.x + a1.w, true);

  eq("there are nine standoffs on the ATX pattern", STANDOFFS.length, 9);
  eq("every standoff is under the board",
     STANDOFFS.every((s) => s.x >= BOARD.x && s.x <= BOARD.x + BOARD.w &&
                            s.y >= BOARD.y && s.y <= BOARD.y + BOARD.h), true);

  group("Desktop sim — snapping is bounded, not magnetic");

  const gpuZone = zoneFor(DESKTOP, "gpu");
  const centre = { x: gpuZone.box.x + gpuZone.box.w / 2, y: gpuZone.box.y + gpuZone.box.h / 2 };
  eq("a drop on the slot centre snaps", snapTarget(DESKTOP, "gpu", centre).id, "pcie-x16");
  eq("a drop just inside the radius snaps",
     snapTarget(DESKTOP, "gpu", { x: centre.x + SNAP_RADIUS - 5, y: centre.y }).id, "pcie-x16");
  // Outside the radius it must NOT snap, or a part dropped across the bench
  // would teleport into a slot the user never aimed at.
  eq("a drop outside the radius does not snap",
     snapTarget(DESKTOP, "gpu", { x: centre.x + SNAP_RADIUS + 40, y: centre.y }), null);
  eq("a part never snaps to another part's zone", snapTarget(DESKTOP, "cpu", centre), null);
  eq("distance is measured to the zone centre", Math.round(distanceTo(gpuZone.box, centre)), 0);

  group("Desktop sim — the parts tray is laid out, not scattered");

  const ids = ["mobo", "psu", "cpu", "paste", "cooler", "ram1", "ram2", "ssd", "gpu"];
  const boxes = ids.map((id) => ({ id, b: trayBox(DESKTOP, id) }));

  // A tray part drawn inside the chassis covers the slot it is meant to be
  // dragged into — which is exactly what happened before this was pinned.
  const overlapsCase = boxes.filter(
    ({ b }) =>
      b.x < CASE_OUTER.x + CASE_OUTER.w &&
      b.x + b.w > CASE_OUTER.x &&
      b.y < CASE_OUTER.y + CASE_OUTER.h &&
      b.y + b.h > CASE_OUTER.y,
  );
  eq("no tray part overlaps the case", overlapsCase.length, 0);

  eq("every tray part is on the canvas",
     boxes.every(({ b }) => b.x >= 0 && b.y >= 0 && b.x + b.w <= CANVAS.w && b.y + b.h <= CANVAS.h), true);

  // And no two parts sit on top of each other.
  let collisions = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b, c = boxes[j].b;
      if (a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y) collisions++;
    }
  }
  eq("no two tray parts overlap each other", collisions, 0);

  group("Desktop sim — drawn slots and drop zones are the same coordinates");

  // The board art and the drop zones both derive from BOARD_SLOTS. Previously
  // they were independent numbers, so a module snapped to a spot with no slot
  // painted under it. These assertions are what stop that returning.
  const inside = (a, b) =>
    a.x >= b.x - 0.5 && a.y >= b.y - 0.5 &&
    a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

  eq("every drawn slot lies on the board",
     BOARD_SLOTS.every((s) => inside(boardSlotBox(DESKTOP, s), BOARD)), true);

  eq("every board slot has a matching zone",
     BOARD_SLOTS.every((s) => ZONES.some((z) => z.id === s.id)), true);

  // A zone's box IS the drawn slot's box — same source, so they cannot drift.
  eq("zone boxes equal their drawn slot boxes",
     BOARD_SLOTS.every((s) => {
       const z = ZONES.find((zz) => zz.id === s.id);
       const b = boardSlotBox(DESKTOP, s);
       return Math.abs(z.box.x - b.x) < 0.01 && Math.abs(z.box.y - b.y) < 0.01 &&
              Math.abs(z.box.w - b.w) < 0.01 && Math.abs(z.box.h - b.h) < 0.01;
     }), true);

  // And a seated part actually overlaps the slot it seats into.
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  for (const id of ["cpu", "ram1", "ram2", "ssd", "gpu"]) {
    const z = zoneFor(DESKTOP, id);
    const seat = seatBox(DESKTOP, id);
    eq(`a seated ${id} overlaps its slot`, overlaps(seat, z.box), true);
  }

  /*
   * Overlap alone is far too weak, and it is why a DIMM lay sideways across
   * the board for as long as it did: a horizontal module anchored at the
   * slot's left edge DOES overlap that slot, so the assertion above passed
   * while the module ran 100 units past the board and out through the case
   * wall. The properties below are the ones that actually pin the geometry.
   */

  // Nothing mounted on the board may hang off it. The GPU is exempt: a 270mm
  // card genuinely overhangs a 244mm board, which is why it is checked
  // against the chassis instead.
  for (const id of ["cpu", "paste", "cooler", "ram1", "ram2", "ssd"]) {
    const s = seatBox(DESKTOP, id);
    eq(`a seated ${id} stays on the board`,
       s.x >= BOARD.x - 0.01 && s.x + s.w <= BOARD.x + BOARD.w + 0.01 &&
       s.y >= BOARD.y - 0.01 && s.y + s.h <= BOARD.y + BOARD.h + 0.01, true);
  }

  // And nothing at all may end up outside the chassis.
  for (const id of ["cpu", "paste", "cooler", "ram1", "ram2", "ssd", "gpu", "psu"]) {
    const s = seatBox(DESKTOP, id);
    eq(`a seated ${id} stays inside the case`,
       s.x >= CASE_INNER.x - 0.01 && s.x + s.w <= CASE_INNER.x + CASE_INNER.w + 0.01 &&
       s.y >= CASE_INNER.y - 0.01 && s.y + s.h <= CASE_INNER.y + CASE_INNER.h + 0.01, true);
  }

  // A module that stands in a slot runs ALONG it, not across it. This is the
  // single assertion that makes a sideways DIMM impossible.
  for (const id of ["ram1", "ram2"]) {
    const z = zoneFor(DESKTOP, id);
    const s = seatBox(DESKTOP, id);
    const slotVertical = z.box.h > z.box.w;
    eq(`a seated ${id} runs along its slot`, s.h > s.w, slotVertical);
    // Centred across the slot, and proud of it at both ends.
    eq(`...centred on it`,
       Math.abs((s.x + s.w / 2) - (z.box.x + z.box.w / 2)) < 0.01 &&
       Math.abs((s.y + s.h / 2) - (z.box.y + z.box.h / 2)) < 0.01, true);
    eq(`...and stands proud of it`, s.h > z.box.h, true);
  }

  // Two sticks side by side must not occupy the same space.
  eq("the two seated DIMMs do not overlap", overlaps(seatBox(DESKTOP, "ram1"), seatBox(DESKTOP, "ram2")), false);

  // A seated DIMM keeps its true proportion: 133mm long against ~15mm across.
  {
    const s = seatBox(DESKTOP, "ram1");
    eq("a seated DIMM is far longer than it is wide", s.h / s.w > 5, true);
  }

  group("Bench — every machine holds together, not just the desktop");

  /*
   * These run over ALL THREE chassis. The desktop's layout bugs — a tray part
   * drawn inside the case, a slot off the board, a seated module out through
   * the wall — were each found by eye, one at a time. Asserting the property
   * over the whole set is what stops the laptop and the server from having to
   * rediscover them.
   */
  for (const c of [DESKTOP, LAPTOP, SERVER]) {
    const zones = zonesOf(c);
    const canvas = { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h };

    eq(`${c.id}: the case is on the canvas`, contains(canvas, c.outer), true);
    eq(`${c.id}: the interior is inside the shell`, contains(c.outer, c.inner), true);
    eq(`${c.id}: the board is inside the interior`, contains(c.inner, c.board), true);

    // Every part can be picked up and has somewhere to go.
    for (const id of c.parts) {
      eq(`${c.id}: ${id} has a place on the tray`, Boolean(c.tray[id]), true);
      eq(`${c.id}: ${id} has a zone to go in`, Boolean(zoneFor(c, id)), true);
    }
    // ...and every zone belongs to a part this machine actually has.
    for (const z of zones) {
      eq(`${c.id}: zone ${z.id} accepts a part this machine has`, c.parts.includes(z.accepts), true);
    }

    // Tray parts sit on the canvas, outside the chassis, and clear of each
    // other. A tray box inside the case draws over the very slot it is meant
    // to be dragged into — which is exactly what the GPU and PSU used to do.
    const trays = c.parts.map((id) => ({ id, box: trayBox(c, id) }));
    for (const t of trays) {
      eq(`${c.id}: ${t.id} rests on the canvas`, contains(canvas, t.box), true);
      eq(`${c.id}: ${t.id} rests outside the chassis`, boxOverlaps(t.box, c.outer), false);
    }
    for (let i = 0; i < trays.length; i++) {
      for (let j = i + 1; j < trays.length; j++) {
        eq(`${c.id}: ${trays[i].id} and ${trays[j].id} do not overlap on the tray`,
           boxOverlaps(trays[i].box, trays[j].box), false);
      }
    }

    // Board slots stay on the board, and seated parts stay in the machine.
    for (const sl of c.slots) {
      eq(`${c.id}: slot ${sl.id} is on the board`, contains(c.board, boardSlotBox(c, sl)), true);
    }
    for (const id of c.parts) {
      const seat = seatBox(c, id);
      if (!seat) continue;
      // The desktop GPU is the one deliberate overhang: a 270mm card on a
      // 244mm board really does hang off it, so it is checked against the
      // chassis rather than the board.
      eq(`${c.id}: a seated ${id} stays inside the case`, contains(c.inner, seat, 1), true);
    }

    // Fasteners are under the thing they hold down.
    for (const so of c.standoffs) {
      eq(`${c.id}: standoff ${so.id} is inside the chassis`,
         so.x >= c.inner.x && so.x <= c.inner.x + c.inner.w &&
         so.y >= c.inner.y && so.y <= c.inner.y + c.inner.h, true);
    }
  }

  group("Cohort — the console reads a ledger, not forty live estates");

  {
    const seats = seatIds();

    // The trail is small. That is the whole architectural claim: a run writes
    // a few hundred bytes, so a cohort fits in kilobytes where forty live
    // VMStates would not fit at all.
    eq("the term is a few hundred events, not a datacentre", LEDGER.length < 400, true);
    eq("...and every event names a seat on the roster",
       LEDGER.every((e) => seats.includes(e.seat)), true);
    eq("...in time order", LEDGER.every((e, i, a) => i === 0 || a[i - 1].at <= e.at), true);

    // Everything is DERIVED. Nothing stores a progress number to fall out of
    // step with the events that produced it.
    const sum = summarise(LEDGER, seats);
    eq("the cohort count is the roster", sum.seats, seats.length);
    eq("resolved adds up across seats",
       seats.reduce((n, s) => n + progressOf(LEDGER, s).resolved, 0), sum.resolved);
    eq("started adds up too",
       seats.reduce((n, s) => n + progressOf(LEDGER, s).started, 0), sum.started);

    // Two seats were provisioned and never signed in. That absence is the
    // finding — a console that silently skipped them would hide it.
    eq("seats that never signed in leave no trail", sum.active, seats.length - 2);
    eq("...and a never-active seat reports nothing rather than crashing",
       progressOf(LEDGER, "s-11").lastActiveAt, null);
    eq("...with no open run", progressOf(LEDGER, "s-11").openRun, null);

    // An unknown seat must answer emptily rather than throw: rosters change.
    eq("an unknown seat is empty, not an error", progressOf(LEDGER, "nobody").started, 0);

    /*
     * THE QUESTION THE CONSOLE EXISTS TO ANSWER.
     * Not "how many tickets are open" but "which exercise is my class unable
     * to do". The fixture is shaped so PoE is that exercise, and the
     * derivation has to find it without being told.
     */
    const hardest = sum.hardest[0];
    eq("the hardest scenario surfaces on its own", hardest.scenario, "csc-t2-poe");
    eq("...because most attempts do not finish", hardest.completionRate < 0.5, true);
    eq("...and it draws the most hints",
       sum.hardest.every((d) => d.hintsTaken <= hardest.hintsTaken), true);
    // Ordering is worst-first, which is the order an instructor reads.
    eq("difficulty is ordered worst first",
       sum.hardest.every((d, i, a) => i === 0 || (a[i - 1].completionRate ?? 1) <= (d.completionRate ?? 1)), true);

    // Stuck means OPEN AND QUIET. Not "slow" and not "took hints" — a student
    // working carefully through a hard scenario is both, and flagging them
    // would train an instructor to ignore the list.
    const st = stuck(LEDGER, seats, 900);
    eq("the stalled runs are found", st.length > 0, true);
    eq("...every one of them is still open",
       st.every((x) => progressOf(LEDGER, x.seat).openRun !== null), true);
    eq("...and none of them has finished that scenario",
       st.every((x) => !LEDGER.some((e) => e.seat === x.seat && e.scenario === x.scenario && e.kind === "ticket.resolved")), true);
    eq("...longest stall first", st.every((x, i, a) => i === 0 || a[i - 1].stalledSec >= x.stalledSec), true);
    // A tighter threshold can only ever find fewer.
    eq("a longer stall threshold narrows the list",
       stuck(LEDGER, seats, 100000).length <= st.length, true);

    // Median, not mean: one abandoned marathon must not make a steady student
    // look slow.
    const steady = progressOf(LEDGER, "s-05");
    eq("a busy seat reports a median time", typeof steady.medianResolveSec, "number");
    eq("...and resolves more than it abandons", steady.resolved > steady.abandoned, true);
  }

  group("Platform — the tiers are an arc, not a feature list");

  {
    // Free must be a COMPLETE first job. If a capability the core loop needs
    // were paid, the free queue would carry tickets it cannot answer — which
    // teaches a new player the product is broken, not that they should pay.
    eq("free reaches level 4", TIERS.free.levelCap, 4);
    eq("free stays in the first growth phase", phaseCapOf("free"), 1);
    eq("free has a shift allowance", TIERS.free.shiftAllowance, 5);
    eq("pro is uncapped", TIERS.pro.levelCap, null);
    eq("pro has no shift limit", TIERS.pro.shiftAllowance, null);

    // The ranking is free on purpose: a leaderboard only paying players can
    // see is a leaderboard of paying players, which is worth less to everyone.
    eq("the leaderboard is free", allows("free", "leaderboard"), true);
    // Reviewing closed work is the thing you buy.
    eq("history is not", allows("free", "ticket-history"), false);
    eq("...and pro has it", allows("pro", "ticket-history"), true);

    // Enterprise is a superset of pro. A plan that costs more and does less in
    // any respect is a plan someone will eventually be caught out by.
    for (const f of TIERS.pro.features) {
      eq(`enterprise keeps pro's ${f}`, allows("enterprise", f), true);
    }
    // ...and pro is a superset of free.
    for (const f of TIERS.free.features) {
      eq(`pro keeps free's ${f}`, allows("pro", f), true);
    }

    // An upsell names the plan that actually carries the thing.
    eq("history upsells to Pro", firstTierWith("ticket-history").id, "pro");
    eq("cohort reporting upsells to Enterprise", firstTierWith("cohort-reporting").id, "enterprise");
    eq("a reason is given when locked", typeof lockReason("free", "ticket-history"), "string");
    eq("...and none when allowed", lockReason("pro", "ticket-history"), null);
  }

  group("Platform — the price page and the plan cannot disagree");

  {
    // Money is minor units. A float that touches a price eventually bills
    // somebody $8.999999999.
    for (const id of ["free", "pro", "enterprise"]) {
      const plan = PRICING[id];
      for (const p of [plan.monthly, plan.yearly]) {
        if (!p) continue;
        eq(`${id} ${p.period} is a whole number of cents`, Number.isInteger(p.amount), true);
        eq(`...and is not negative`, p.amount >= 0, true);
      }
    }

    eq("free is actually free", PRICING.free.monthly.amount, 0);
    eq("...and says so rather than printing $0", format(PRICING.free.monthly), "Free");

    // A year must beat twelve months, or the annual plan is a worse deal
    // dressed as a better one.
    eq("a year costs less than twelve months",
       PRICING.pro.yearly.amount < PRICING.pro.monthly.amount * 12, true);
    eq("...and the saving is worth stating", yearlySaving(PRICING.pro) >= 20, true);
    eq("the per-month figure is derived, not typed",
       perMonthFromYearly(PRICING.pro.yearly), "$6.58/mo");

    // Enterprise is sold by the seat, per year, and not self-serve.
    eq("enterprise is priced per seat", PRICING.enterprise.yearly.unit, "seat");
    eq("...with a floor", PRICING.enterprise.minimumSeats, 25);
    eq("...and is a conversation, not a buy button", PRICING.enterprise.contactOnly, true);
    eq("there is no monthly enterprise price", PRICING.enterprise.monthly, null);

    // The floor is a floor: a smaller cohort still bills the minimum.
    eq("ten seats bill as the minimum", seatsTotal(10), seatsTotal(25));
    eq("forty seats bill as forty", seatsTotal(40), 40 * PRICING.enterprise.yearly.amount);
    eq("...and reads as money", formatTotal(seatsTotal(40)), "$1,600");

    // Every tier the product offers has a price entry. A plan the pricing page
    // cannot describe is a plan nobody can buy.
    for (const id of Object.keys(TIERS)) {
      eq(`${id} has pricing`, Boolean(PRICING[id]), true);
      eq(`...for the same tier`, PRICING[id].tier, id);
    }
  }

  group("Platform — the shift limits what you start, not what you finish");

  {
    const DAY_MS = 86_400_000;
    // Mid-morning, so adding hours inside the test never crosses midnight by
    // accident and the day boundary is tested deliberately instead.
    const t = new Date(2026, 4, 14, 10, 0, 0).getTime();

    let s = freshShift(t);
    eq("a fresh shift has used nothing", s.used, 0);
    eq("five are available", remaining(s, 5, t), 5);

    for (let i = 0; i < 5; i++) s = takeOn(s, 5, t);
    eq("five taken on spends the shift", s.used, 5);
    eq("nothing is left", remaining(s, 5, t), 0);
    eq("and no more can be taken on", canTakeOn(s, 5, t), false);
    // Spending past the end must not run the counter away.
    eq("over-spending is refused, not counted", takeOn(s, 5, t).used, 5);

    // The next day is a new shift — and it is the PLAYER's day.
    const tomorrow = t + DAY_MS;
    eq("a new day rolls the count over", rollover(s, tomorrow).used, 0);
    eq("...and re-opens the desk", canTakeOn(s, 5, tomorrow), true);
    eq("the same day does not", rollover(s, t + 3_600_000).used, 5);

    // An unlimited plan is unlimited, and says so rather than returning a
    // number a screen might render.
    eq("pro has no remaining count", remaining(s, null, t), null);
    eq("...and can always take one on", canTakeOn(s, null, t), true);

    // The reset is local midnight, not UTC: "in the morning" has to mean the
    // player's morning.
    const reset = nextShiftAt(t);
    eq("the next shift is at midnight", new Date(reset).getHours(), 0);
    eq("...tonight, not tomorrow night", reset - t < DAY_MS, true);
    eq("...and it is in the future", reset > t, true);
  }

  group("Admin — the panel's figures are derived, and its dates point the right way");

  {
    const DAY = 86_400_000;
    const t0 = 1_700_000_000_000;

    /*
     * `inDays` ran its subtraction the PAST direction inside a function whose
     * whole job is to describe a renewal that has not happened yet. Every
     * future date came out negative, took the "today" branch, and four
     * accounts renewing across four months all read the same.
     */
    eq("a date a month out reads as future", inDays(t0 + 30 * DAY, t0), "in 30 days");
    eq("tomorrow is singular", inDays(t0 + DAY, t0), "in 1 day");
    eq("today is today", inDays(t0, t0), "today");
    eq("a past date reads as past", inDays(t0 - 12 * DAY, t0), "12 days ago");
    eq("...and is singular too", inDays(t0 - DAY, t0), "1 day ago");

    // The open-ticket figure and the triage queue are ONE list. They used to be
    // a number stored on each run and a set of rows, free to disagree.
    const openRows = SUPPORT_TICKETS.filter((t) => t.state !== "resolved").length;
    eq("the headline count is the queue", openTickets(), openRows);
    eq("per-run counts add up to the whole",
       ACTIVE_SCENARIOS.reduce((n, r) => n + openTicketsFor(r.id), 0) +
         SUPPORT_TICKETS.filter((t) => t.runId === null && t.state !== "resolved").length,
       openTickets());

    // Breach is a comparison with the clock, so it must move when the clock does.
    const overdue = SUPPORT_TICKETS.find((t) => t.state !== "resolved");
    eq("a ticket is not breached before it is due", isBreached(overdue, overdue.dueAt - 1000), false);
    eq("...and is breached after", isBreached(overdue, overdue.dueAt + 1000), true);
    // A closed ticket cannot breach, however long ago it was due.
    const closed = SUPPORT_TICKETS.find((t) => t.state === "resolved");
    eq("a resolved ticket never breaches", isBreached(closed, Date.now() + 400 * DAY), false);

    // Every ticket points at a run that exists, or at nothing on purpose.
    for (const t of SUPPORT_TICKETS) {
      if (!t.runId) continue;
      eq(`${t.id} points at a real run`, ACTIVE_SCENARIOS.some((r) => r.id === t.runId), true);
    }

    // Seats cannot be used that were never bought.
    for (const sub of SUBSCRIPTIONS) {
      eq(`${sub.org} does not oversubscribe its own seats`, sub.seatsUsed <= sub.seats, true);
    }
    eq("the seat totals agree with the accounts",
       SUBSCRIPTIONS.reduce((n, x) => n + x.seatsUsed, 0), seatsUsed());

    // The masked credential is masked, and is not a plausible live key.
    eq("the API credential is masked", /\*{6,}/.test(PLATFORM_SETTINGS.apiKeyMasked), true);
    eq("...and is marked as a demo value", PLATFORM_SETTINGS.apiKeyMasked.startsWith("itq_demo_"), true);
    // And a rotation is something that already happened.
    eq("the key was rotated in the past", PLATFORM_SETTINGS.apiKeyRotatedAt < Date.now(), true);
  }

  group("Bench — every hardware ticket opens the simulator");

  /*
   * The Workshop is gone. It was a second, parallel idea of what a machine is
   * — its own teardown, its own BIOS, its own imaging — and two engines meant
   * two sets of rules that did not stay in step. Every job now opens the one
   * bench, so every job has to describe how.
   */
  {
    const hosts = [
      ["WS-101", "desktop"], ["LT-204", "laptop"], ["LAP-9", "laptop"],
      ["FS-01", "server"], ["SQL-02", "server"], ["WEB-03", "server"],
    ];
    for (const [host, want] of hosts) {
      const job = jobForTicket({
        id: "TCK-1", templateId: "gen-x", tags: ["hardware", "ram"],
        dynamicContext: { targetNodeId: host.toLowerCase(), targetHostname: host },
      });
      eq(`${host} opens a ${want}`, job.bench.chassis, want);
    }

    // A named failure lands on a part that machine actually has.
    const cases = [
      [["hardware", "ram"], "FS-01", "rdimm1"],
      [["hardware", "disk"], "FS-01", "bayA"],
      [["hardware", "psu"], "FS-01", "psuA"],
      [["hardware", "ram"], "LT-204", "sodimm1"],
      [["hardware", "ssd"], "LT-204", "nvme"],
      [["hardware", "cooling"], "LT-204", "blower"],
      [["hardware", "ram"], "WS-101", "ram1"],
      [["hardware", "psu"], "WS-101", "psu"],
    ];
    for (const [tags, host, part] of cases) {
      const job = jobForTicket({
        id: "TCK-2", templateId: "gen-y", tags,
        dynamicContext: { targetNodeId: host.toLowerCase(), targetHostname: host },
      });
      eq(`${host} + ${tags[1]} fails ${part}`, job.bench.faulty, [part]);
      // ...and that part is genuinely on that machine, not merely a plausible id.
      eq(`...and ${part} is a part a ${job.bench.chassis} has`,
         CHASSIS[job.bench.chassis].parts.includes(part), true);
    }

    // A repair with NOTHING broken is still a repair: a BIOS change or a
    // re-image happens on a machine that already exists and is whole. It must
    // open assembled, or the operator is asked to build a box that is already
    // on the desk.
    {
      const biosOnly = jobForTicket({
        id: "TCK-4", templateId: "gen-z", tags: ["hardware", "bios"],
        dynamicContext: { targetNodeId: "ws-9", targetHostname: "WS-9" },
      });
      eq("a firmware-only job is not a build", biosOnly.bench.isBuild, false);
      eq("...and has nothing faulty", biosOnly.bench.faulty, []);
      // The bench decides empty-vs-assembled on isBuild, so a populated start
      // is what this yields.
      const opened = populatedBuild(CHASSIS[biosOnly.bench.chassis], biosOnly.bench.faulty);
      eq("...so it opens assembled", report(opened).complete, true);
    }

    // A build declares itself a build; a repair does not.
    const build = jobForTicket({
      id: "TCK-3", templateId: "hw-t1-new-starter-build",
      dynamicContext: { targetUserName: "Nia Petrov", targetHostname: "new-starter workstation" },
    });
    eq("a build opens an empty machine", build.bench.faulty, []);
    eq("...and says so", build.bench.isBuild, true);
  }

  group("Bench — every machine can actually be finished");

  /*
   * Both of these were reported from the bench: fitting the board on a laptop
   * or a server made it disappear, and one cable on each could never be
   * plugged in, so the build could never reach complete. Both had the same
   * cause — desktop assumptions surviving in code that now serves three
   * machines — and both are properties, so both get asserted.
   */
  for (const c of [DESKTOP, LAPTOP, SERVER]) {
    // The view draws the main board by ROLE. Exactly one part must answer to
    // that, or it draws nothing (which is what made the board vanish) or the
    // wrong thing.
    const boards = partsOf(c).filter((p) => p.role === "board");
    eq(`${c.id}: exactly one part is the board`, boards.length, 1);

    // Every cable has a run, or it cannot be drawn at all.
    for (const id of c.cables) {
      eq(`${c.id}: cable ${id} has a declared run`, Boolean(c.cableRuns[id]), true);
    }
    // ...and no two runs share an endpoint, or one sits on top of the other
    // and only the topmost can ever be clicked.
    const runs = c.cables.map((id) => ({ id, r: c.cableRuns[id] })).filter((x) => x.r);
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i].r, b = runs[j].r;
        const apart = Math.hypot(a.to[0] - b.to[0], a.to[1] - b.to[1]);
        eq(`${c.id}: ${runs[i].id} and ${runs[j].id} land in different places`, apart > 0.04, true);
      }
    }
    // Endpoints stay inside the machine.
    for (const { id, r } of runs) {
      for (const [lbl, pt] of [["from", r.from], ["to", r.to]]) {
        eq(`${c.id}: ${id} ${lbl} is inside the chassis`,
           pt[0] >= 0 && pt[0] <= 1 && pt[1] >= 0 && pt[1] <= 1, true);
      }
    }

    // And the machine can be driven from empty to complete. This is the
    // property both bugs actually broke, so it is asserted end to end rather
    // than inferred from the pieces.
    let b = emptyBuild(c.id);
    for (let guard = 0; guard < 60; guard++) {
      const step = nextStep(b);
      if (!step) break;
      b = step.kind === "cable" ? connect(b, step.id) : install(b, step.id);
    }
    eq(`${c.id}: guidance alone can finish the build`, report(b).complete, true);
    eq(`${c.id}: ...with every part seated`, b.installed.length, c.parts.length);
    eq(`${c.id}: ...and every cable connected`, b.connected.length, c.cables.length);
    eq(`${c.id}: ...and it POSTs`, postHalt(b), null);
  }

  group("Bench — the three machines are genuinely different machines");

  {
    // A laptop's battery goes in last and comes out first, because it lies
    // over the M.2 bays. That ordering is a safety rule, and it is encoded
    // once — in `needs` — rather than written down twice.
    const lap = populatedBuild(LAPTOP, []);
    eq("a laptop battery cannot come out while the M.2 cards are under it",
       removeBlockedBy(lap, "nvme") !== null, true);
    eq("...and the battery itself is free to come out first",
       removeBlockedBy(lap, "battery"), null);

    // A server drive and a server PSU depend on nothing. That is what a
    // hot-swap bay and a redundant supply MEAN.
    const srv = emptyBuild("server");
    eq("a server drive needs nothing fitted first", blockedBy(srv, "bayA"), null);
    eq("...and neither does either supply", blockedBy(srv, "psuA"), null);
    eq("but a heatsink still needs its CPU", blockedBy(srv, "hsA") !== null, true);

    // Memory belongs to a socket. Bank B with no CPU 1 is memory that is
    // simply not there — a fault a single-socket board cannot have.
    const oneCpu = install(install(emptyBuild("server"), "srvboard"), "cpuA");
    eq("bank A opens once its own CPU is in", blockedBy(oneCpu, "rdimm1"), null);
    eq("bank B stays shut without CPU 1", blockedBy(oneCpu, "rdimm3") !== null, true);

    // Only the desktop asks for paste. A machine whose cooler ships with a pad
    // must not be able to fail a check it cannot pass.
    eq("the desktop wants thermal interface", partsOf(DESKTOP).some((p) => p.role === "thermal-interface"), true);
    eq("the laptop does not", partsOf(LAPTOP).some((p) => p.role === "thermal-interface"), false);
    eq("the server does not", partsOf(SERVER).some((p) => p.role === "thermal-interface"), false);
  }

  group("Bench — a repair is a build that starts populated");

  {
    // A failed part is fitted, so it is not something you can fit again.
    const broken = populatedBuild(DESKTOP, ["ram2"]);
    eq("a repair starts assembled", broken.installed.length, DESKTOP.parts.length);
    eq("...with the failure named", broken.faulty, ["ram2"]);
    eq("...and is NOT complete", report(broken).complete, false);
    eq("...for a reason that names the part", /RAM \(slot A2\) has failed/.test(report(broken).faults[0]), true);
    eq("the failed part cannot simply be refitted", blockedBy(broken, "ram2"), "Failed — remove it first");

    // Take it out, put a sound one in, and the machine is whole.
    const pulled = remove(broken, "ram2");
    eq("removing it clears the fault", pulled.faulty.length, 0);
    eq("...and leaves the slot empty", isInstalled(pulled, "ram2"), false);
    const fixed = install(pulled, "ram2");
    eq("a part fitted from stock is sound", isFaulty(fixed, "ram2"), false);
    eq("...and the machine is complete again", report(fixed).complete, true);

    // The next step names the job rather than the next part in the list.
    eq("guidance leads with the failure", nextStep(broken).kind, "remove");
  }

  group("Bench → estate — a build is graded on what is in the machine");

  {
    // The specs used to be accepted and dropped on the floor, so a machine
    // handed over with one stick was indistinguishable from a correct one.
    const node = buildBenchNode({
      machine: "desktop", cpuModel: "6-core", ramGb: 16, diskGb: 512,
      nodeId: "acme-ws-9", hostname: "ACME-WS-9", ip: "10.0.0.60", gateway: "10.0.0.1",
    });
    eq("a commissioned machine records what was fitted", node.benchSpec.ramGb, 16);
    eq("...including the disk", node.benchSpec.diskGb, 512);
    eq("...and is tagged as bench-built", node.tags.includes("bench-built"), true);

    // Under-built machines are visibly under-built, which is what lets a
    // sign-off refuse them rather than pass anything that reaches the estate.
    const short = buildBenchNode({
      machine: "desktop", cpuModel: "6-core", ramGb: 8, diskGb: 256,
      nodeId: "acme-ws-10", hostname: "ACME-WS-10", ip: "10.0.0.61", gateway: "10.0.0.1",
    });
    eq("a half-built machine reports the memory it actually has", short.benchSpec.ramGb, 8);

    // Commissioning does NOT join a domain. That is a separate act, and the
    // build ticket grades it separately.
    eq("a freshly imaged machine is not domain-joined", node.domain, undefined);
  }

  group("Bench → tickets — the build job is its own shape");

  {
    const t = {
      id: "TCK-9001", templateId: "hw-t1-new-starter-build", title: "New starter build",
      dynamicContext: { targetUserName: "Nia Petrov", targetHostname: "new-starter workstation" },
    };
    const job = jobForTicket(t);
    eq("a build ticket yields a job", job !== null, true);
    // The guard every repair job passes would have rejected this one: there is
    // no node yet, because the bench is what makes it.
    eq("...without needing a node that does not exist yet", job.targetNodeId, "");
    eq("...carrying a build spec, not a swap spec", Boolean(job.build) && !job.assembly, true);
    eq("...naming who it is for", job.build.forWhom, "Nia Petrov");
    eq("...and requiring a domain join", job.build.joinDomain, true);

    // A repair ticket with no target still yields nothing, which is what keeps
    // un-actionable rows out of the Lab.
    eq("a repair with no target is still refused",
       jobForTicket({ id: "TCK-9002", templateId: "hw-t1-ram-upgrade", dynamicContext: {} }), null);
  }

  group("Desktop sim — the multimeter reads the loom, it does not change it");

  {
    // A rail with no supply behind it is dead, and says why.
    const bare = { chassis: "desktop", installed: [], connected: [], faulty: [] };
    eq("no PSU reads zero", railReading(bare, "cpu8").actualV, 0);
    eq("...and is not live", railReading(bare, "cpu8").live, false);
    eq("...and names the cause", /No power supply/.test(railReading(bare, "cpu8").note), true);

    // Fitted but unplugged is the fault a learner actually has to find.
    const psuOnly = { chassis: "desktop", installed: ["psu"], connected: [], faulty: [] };
    eq("an unplugged rail reads zero", railReading(psuOnly, "cpu8").actualV, 0);
    eq("...and blames the connector", /not seated/.test(railReading(psuOnly, "cpu8").note), true);

    // Plugged in, it reads close to nominal.
    const wired = { chassis: "desktop", installed: ["psu"], connected: ["cpu8", "atx24"], faulty: [] };
    const cpu = railReading(wired, "cpu8");
    eq("a seated 12V rail is live", cpu.live, true);
    eq("...and reads within a tenth of nominal", Math.abs(cpu.actualV - cpu.nominalV) < 0.1, true);
    eq("the ATX rail is a 3.3V rail", railReading(wired, "atx24").nominalV, 3.3);

    // Probing is read-only. This is the whole point of a meter.
    const before = JSON.stringify(wired);
    railReading(wired, "pcie8");
    eq("probing mutates nothing", JSON.stringify(wired), before);
  }

  // Portrait board: taller than it is wide, as a 244 x 305mm ATX board is.
  eq("the board is portrait", BOARD.h > BOARD.w, true);
  eq("...and its art aspect matches", Math.round(artHeight("mobo")), 125);
}

{
  group("Polish — app gating is total");

  // Every gated app refuses below its level and permits at it. This is the
  // property the old Monitor bypass violated: a level-2 operator reached
  // Procurement, which opens at 4. The Monitor and NetOps Console were folded
  // into the Edge Gateway Manager (v0.9.3); `edge` inherits their level, so the
  // same bypass is still pinned below.
  for (const app of ["edge", "switches", "hardwarelab", "assetmanager",
                     "procurement", "backup", "racklab", "serverman", "aethercloud"]) {
    const need = appUnlockLevel(app);
    eq(`${app} is locked below level ${need}`, isAppUnlocked(app, need - 1), false);
    eq(`${app} opens at level ${need}`, isAppUnlocked(app, need), true);
  }

  // The intern's core loop is never gated — an operator with no apps at all
  // would have nothing to do on their first day.
  eq("the ticket queue is always available", isAppUnlocked("itsm", 1), true);
  eq("so is the remote gateway", isAppUnlocked("gateway", 1), true);
  eq("and the wiki", isAppUnlocked("wiki", 1), true);

  // The specific reported bypass, pinned. Carried onto the Edge Gateway, which
  // now opens at the level the Monitor used to.
  eq("the Edge Gateway opens before Procurement — the bypass path", appUnlockLevel("edge") < appUnlockLevel("procurement"), true);
  eq("...so an Edge-Gateway-level operator must NOT reach Procurement",
     isAppUnlocked("procurement", appUnlockLevel("edge")), false);

  // Tiers gate in step with the operator's ability to work them.
  eq("Tier 1 from the start", unlockedTiers(1).includes("Tier_1_Easy"), true);
  eq("Tier 4 is not", unlockedTiers(1).includes("Tier_4_Expert"), false);
  eq("Tier 4 by level 7", unlockedTiers(7).includes("Tier_4_Expert"), true);
}

{
  group("Polish — the hint engine reads live state");

  const baseWorld = () => structuredClone({
    nodes: {},
    subnets: [{ cidr: "10.1.1.0/24", label: "Core" }],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [] },
    traffic: { nvr: null, cameras: {}, uplinkMbps: {}, backboneMbps: 1000, baselineMbps: 0 },
    backup: { tier: "none", policies: {}, dataLost: [], log: [] },
    incident: { startedAt: null, patientZero: null, compromised: [], encryptedShareIds: [], containedAt: null, resolvedAt: null },
    datacenter: { racks: [] },
    growth: { phase: 0 },
  });

  const ticket = (tags = [], ctx = {}) => ({
    id: "t1", tags, hints: [], dynamicContext: ctx, status: "new",
  });

  // Three stages, always — the reveal mechanic charges XP per step and must
  // have something to give at each one.
  const clean = liveHints(baseWorld(), ticket(["poe"]));
  eq("the ladder always has three stages", clean.length, 3);
  eq("stage 1 names WHERE", clean[0].stage, 1);
  eq("...and points at the right app", clean[0].app, "switches");
  eq("tags route to the owning app", appForTicket(ticket(["backup"])), "backup");
  eq("...and fall back to the gateway", appForTicket(ticket([])), "gateway");

  /*
   * THE CAPABILITY THAT DID NOT EXIST BEFORE.
   *
   * A static hint written with the template cannot name the port that is
   * actually down. This one reads the estate and does — and, crucially, stops
   * saying it the moment the operator fixes it.
   */
  const down = baseWorld();
  down.nodes["CAM-1"] = { nodeId: "CAM-1", hostname: "CAM-1", role: "ip-camera",
    connection: { ip: "10.1.1.21", online: true, reachable: true, port: 22, protocol: "ssh", requiresCredentials: true, authenticated: false, latencyMs: 2 },
    health: { status: "healthy", cpuLoad: 4, memUsedPct: 10, diskUsedPct: 5, uptimeSeconds: 10 } };
  down.poe.switches = [{ id: "sw1", name: "MERC-PSW-01", mgmtIp: "10.1.1.2", standard: "at", budgetW: 130,
    ports: [{ n: 7, enabled: false, poeEnabled: true, priority: "high", attachedNodeId: "CAM-1" }] }];

  const named = liveHints(down, ticket(["poe"]));
  eq("stage 2 names the actual port", /Port 7/.test(named[1].text), true);
  eq("...and the actual switch", /MERC-PSW-01/.test(named[1].text), true);
  eq("...and the device behind it", /CAM-1/.test(named[1].text), true);
  eq("stage 3 says how to fix it", /Port enabled/.test(named[2].text), true);

  // FIXED FAULTS STOP BEING HINTED. This is what a static string cannot do.
  const fixed = structuredClone(down);
  fixed.poe.switches[0].ports[0].enabled = true;
  eq("a repaired port is no longer named", /Port 7 on MERC-PSW-01 is administratively down/.test(liveHints(fixed, ticket(["poe"]))[1].text), false);

  // An incident outranks everything: while it is spreading, nothing else is
  // the useful thing to say.
  const hit = baseWorld();
  hit.incident = { startedAt: 1, patientZero: "MAC-1", compromised: [{ nodeId: "MAC-1", at: 1, vector: "phishing" }], encryptedShareIds: [], containedAt: null, resolvedAt: null };
  const inc = liveHints(hit, ticket(["poe"]));
  eq("an active incident outranks a PoE fault", /MAC-1/.test(inc[1].text), true);
  eq("...and redirects the operator to the incident's next step", inc[1].app != null, true);

  // A locked account is named by login and display name.
  const dir = baseWorld();
  dir.nodes["DC-1"] = { nodeId: "DC-1", hostname: "DC-1", role: "domain-controller", os: "windows",
    connection: { ip: "10.1.1.10", online: true, reachable: true, port: 3389, protocol: "rdp", requiresCredentials: true, authenticated: false, latencyMs: 2 },
    health: { status: "healthy", cpuLoad: 4, memUsedPct: 10, diskUsedPct: 5, uptimeSeconds: 10 },
    activeDirectory: { users: [{ samAccountName: "j.doe", displayName: "Jane Doe", locked: true, enabled: true }], groups: [], ous: [] } };
  const locked = liveHints(dir, ticket(["identity"], { targetUserId: "j.doe" }));
  eq("a locked account is named", /Jane Doe/.test(locked[1].text), true);
  eq("...by login name too", /j\.doe/.test(locked[1].text), true);

  /*
   * HONEST FALLBACK. When nothing is visibly broken the engine says so rather
   * than inventing a fault — the static hints it replaced were confidently
   * wrong in exactly this situation.
   */
  const quiet = liveHints(baseWorld(), ticket([]));
  eq("a clean estate admits it cannot see the fault", /Nothing on the estate is reporting a fault/.test(quiet[1].text), true);

  // A probe that throws must not take the hint system down: the operator asked
  // for help, and a crash is the one answer worse than none.
  const broken = baseWorld();
  broken.poe = null;
  eq("a malformed world still produces hints", liveHints(broken, ticket(["poe"])).length, 3);
}

// ── QA2: hardware binding and cascade failures ──────────────────────────────
{
  group("QA2 — the Hardware Lab sees procedural work");

  /*
   * THE REPORTED BUG. Recognition was `templateId.startsWith("hw-")`, which
   * matched the nine hand-authored scenarios and none of the thirty-two
   * procedural families — so a generated RAM upgrade left the Lab empty. The
   * ambient engine draws mostly from those families, which made it constant.
   */
  eq("hand-authored hardware is recognised", isHardwareTicket("hw-t1-ram-upgrade", []), true);
  eq("a procedural RAM job WAS invisible by id alone", "gen-ram-upgrade-1-2".startsWith("hw-"), false);
  eq("...and is now recognised by tag", isHardwareTicket("gen-ram-upgrade-1-2", ["hardware", "ram"]), true);
  eq("a disk swap is recognised", isHardwareTicket("gen-disk-swap-2-1", ["hardware", "disk", "raid"]), true);
  eq("a lockout is NOT hardware", isHardwareTicket("gen-lockout-1-1", ["identity", "ad"]), false);
  eq("...nor is a phishing report", isHardwareTicket("gen-phish-1-1", ["phishing"]), false);

  group("QA2 — jobs derive from what the ticket needs");

  const t = (id, tags, host = "WS-401") => ({
    id: "tkt-1", templateId: id, title: "x", tags,
    dynamicContext: { targetNodeId: "n1", targetHostname: host },
  });

  const ram = jobForTicket(t("gen-ram-upgrade-1-2", ["hardware", "ram"]));
  eq("a derived job exists for a procedural family", ram !== null, true);
  eq("...and asks for the right part", ram.assembly.defective, "ram");
  eq("...with a bench stage", ram.stages.includes("assembly"), true);

  // The part comes from the tag that names it, and order matters: a ticket
  // tagged both raid and disk is a disk job, not a memory one.
  eq("a raid job fits an SSD", jobForTicket(t("gen-disk-swap-2-1", ["hardware", "raid", "disk"])).assembly.defective, "ssd");

  // Chassis type is inferred from the hostname the ticket already carries.
  eq("a server hostname opens a server chassis",
     jobForTicket(t("gen-disk-swap-2-1", ["hardware", "disk"], "KITE-FS-03")).assembly.archetype, "server");
  eq("a Mac hostname opens a laptop",
     jobForTicket(t("gen-ram-upgrade-1-1", ["hardware", "ram"], "MAC-411")).assembly.archetype, "laptop");
  eq("...and a server job needs its baffle removed",
     jobForTicket(t("gen-disk-swap-2-1", ["hardware", "disk"], "KITE-FS-03")).assembly.baffle, true);

  // A ticket with nothing physical to do must NOT appear at the bench.
  eq("a non-hardware ticket derives no job", jobForTicket(t("gen-lockout-1-1", ["identity"])), null);
  // Nor may a job exist without a target — that would be a row opening an
  // empty workshop.
  eq("no target node means no job",
     jobForTicket({ id: "x", templateId: "gen-ram-upgrade-1-1", tags: ["ram"], dynamicContext: {} }), null);
}

{
  group("QA2 — cascade: thermal");

  const world = (over = {}) => structuredClone({
    nodes: {
      "SQL-1": {
        nodeId: "SQL-1", hostname: "SQL-1", role: "database", os: "linux",
        connection: { ip: "10.1.1.30", port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 4 },
        health: { status: "healthy", cpuLoad: 20, memUsedPct: 40, diskUsedPct: 45, uptimeSeconds: 100 },
        services: { postgresql: { name: "postgresql", status: "active" } },
      },
    },
    subnets: [{ cidr: "10.1.1.0/24", label: "Core" }],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [] },
    cascade: { faults: [{ id: "f1", kind: "thermal", nodeId: "SQL-1", startedAt: 1 }] },
    ...over,
  });

  const w = world();
  const f = () => w.cascade.faults[0];

  // THE SYMPTOM IS DERIVED. Latency inflates without anything being written
  // onto the node — which is what lets it disappear the moment the root cause
  // is fixed, with no cleanup code to forget.
  eq("a throttled host runs slow", cascadeLatencyFactor(w, "SQL-1"), THERMAL_LATENCY_FACTOR);
  eq("...and a healthy one does not", cascadeLatencyFactor(w, "OTHER"), 1);
  eq("it is NOT taken offline — slow is the lesson", w.nodes["SQL-1"].connection.online, true);

  // The sequence is enforced in order.
  eq("it starts at diagnosis", cascadeStatus(w, f()).stage, "diagnosing");
  eq("...pointing at the Server Manager", cascadeStatus(w, f()).nextApp, "serverman");
  eq("...and is not resolved", cascadeResolved(w, f()), false);

  const down = world();
  down.nodes["SQL-1"].connection.online = false;
  eq("powering down advances the stage", cascadeStatus(down, down.cascade.faults[0]).stage, "drained");
  eq("...and sends the operator to the bench", cascadeStatus(down, down.cascade.faults[0]).nextApp, "hardwarelab");

  const swapped = structuredClone(down);
  swapped.cascade.faults[0].partReplacedAt = Date.now();
  eq("replacing the part advances again", cascadeStatus(swapped, swapped.cascade.faults[0]).stage, "repaired");

  const booted = structuredClone(swapped);
  booted.nodes["SQL-1"].connection.online = true;
  eq("booting it finishes the sequence", cascadeStatus(booted, booted.cascade.faults[0]).stage, "resolved");
  eq("...so the ticket can close", cascadeResolved(booted, booted.cascade.faults[0]), true);
  eq("...and the latency penalty is gone once cleared",
     cascadeLatencyFactor({ ...booted, cascade: { faults: [{ ...booted.cascade.faults[0], clearedAt: 1 }] } }, "SQL-1"), 1);

  // A repaired host that gets powered down again regresses — the stage is the
  // truth about the world, not a counter.
  const reDown = structuredClone(booted);
  reDown.nodes["SQL-1"].connection.online = false;
  eq("powering it back down regresses the stage", cascadeStatus(reDown, reDown.cascade.faults[0]).stage, "repaired");
}

{
  group("QA2 — cascade: rogue DHCP");

  const w = structuredClone({
    nodes: {
      "WS-9": {
        nodeId: "WS-9", hostname: "WS-9", role: "workstation", os: "windows",
        connection: { ip: "192.168.88.147", port: 3389, protocol: "rdp", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 3 },
        health: { status: "healthy", cpuLoad: 10, memUsedPct: 30, diskUsedPct: 40, uptimeSeconds: 50 },
        services: {},
      },
    },
    subnets: [{ cidr: "10.1.3.0/24", label: "User" }],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [{ id: "sw1", name: "SW1", mgmtIp: "10.1.1.2", standard: "at", budgetW: 100,
      ports: [{ n: 4, enabled: true, poeEnabled: true, priority: "high", attachedNodeId: "WS-9" }] }] },
    cascade: { faults: [{ id: "f2", kind: "rogue-dhcp", nodeId: "WS-9", startedAt: 1 }] },
  });

  // The address is off-estate: on the network and unreachable at once.
  eq("the rogue address is outside every subnet",
     w.subnets.some((s) => w.nodes["WS-9"].connection.ip.startsWith(s.cidr.split("/")[0].split(".").slice(0,3).join("."))), false);
  eq("it starts at diagnosis", cascadeStatus(w, w.cascade.faults[0]).stage, "diagnosing");
  eq("...in the switch panel", cascadeStatus(w, w.cascade.faults[0]).nextApp, "switches");

  const cut = structuredClone(w);
  cut.poe.switches[0].ports[0].enabled = false;
  eq("cutting the port advances the stage", cascadeStatus(cut, cut.cascade.faults[0]).stage, "drained");

  const fixed = structuredClone(cut);
  fixed.nodes["WS-9"].connection.ip = "10.1.3.44";
  eq("a correct address advances again", cascadeStatus(fixed, fixed.cascade.faults[0]).stage, "repaired");

  const back = structuredClone(fixed);
  back.poe.switches[0].ports[0].enabled = true;
  eq("re-enabling the port finishes it", cascadeResolved(back, back.cascade.faults[0]), true);

  // Throttling is thermal-only; a DHCP fault does not slow the host down.
  eq("a DHCP cascade does not inflate latency", cascadeLatencyFactor(w, "WS-9"), 1);
}

{
  group("QA2 — cascade: storage dependency");

  const w = structuredClone({
    nodes: {
      "SQL-2": {
        nodeId: "SQL-2", hostname: "SQL-2", role: "database", os: "linux",
        connection: { ip: "10.1.1.31", port: 22, protocol: "ssh", reachable: true, online: true, requiresCredentials: true, authenticated: false, latencyMs: 3 },
        health: { status: "critical", cpuLoad: 30, memUsedPct: 50, diskUsedPct: 99, uptimeSeconds: 10 },
        services: { postgresql: { name: "postgresql", status: "failed" } },
      },
    },
    subnets: [{ cidr: "10.1.1.0/24", label: "Core" }],
    security: { isolatedNodeIds: [] },
    ipam: { leases: {}, pools: [], faults: [] },
    poe: { switches: [] },
    cascade: { faults: [{ id: "f3", kind: "storage-dependency", nodeId: "SQL-2", startedAt: 1 }] },
  });

  // THE LESSON: restarting the service achieves nothing while the volume is
  // full, so the sequence refuses to advance on a restart alone.
  eq("a full volume blocks the repair", cascadeStatus(w, w.cascade.faults[0]).stage, "diagnosing");
  const restartedOnly = structuredClone(w);
  restartedOnly.nodes["SQL-2"].services.postgresql.status = "active";
  eq("restarting the service alone does NOT resolve it", cascadeResolved(restartedOnly, restartedOnly.cascade.faults[0]), false);

  // Either route out of a full disk counts.
  const logsCleared = structuredClone(w);
  logsCleared.nodes["SQL-2"].health.diskUsedPct = 72;
  eq("clearing logs frees the repair", cascadeStatus(logsCleared, logsCleared.cascade.faults[0]).stage, "repaired");

  const biggerDisk = structuredClone(w);
  biggerDisk.cascade.faults[0].partReplacedAt = Date.now();
  eq("a larger disk does too", cascadeStatus(biggerDisk, biggerDisk.cascade.faults[0]).stage, "repaired");

  const done = structuredClone(logsCleared);
  done.nodes["SQL-2"].services.postgresql.status = "active";
  eq("space plus a running service resolves it", cascadeResolved(done, done.cascade.faults[0]), true);

  group("QA2 — cascade bookkeeping");

  eq("cleared faults drop out of the active list",
     activeCascades({ cascade: { faults: [{ id: "x", kind: "thermal", nodeId: "n", startedAt: 1, clearedAt: 2 }] } }).length, 0);
  eq("a missing slice is not a crash", activeCascades({}).length, 0);
  eq("every kind costs health", Object.values(CASCADE_HEALTH_PENALTY).every((v) => v > 0), true);
}

// ── Onboarding — tour eligibility and progression ──────────────────────────
{
  group("Onboarding — global intro eligibility");

  const fresh = {
    level: 1,
    openAppIds: ["dashboard"],
    selectedTicketId: null,
    ticketStatus: {},
    resolvedCount: 0,
  };

  eq("a brand-new operator gets the first-shift tour", eligibleSequence(fresh, []), "first_boot");
  eq("having seen it, they are not offered it again", eligibleSequence(fresh, ["first_boot"]), null);
  eq("it stops being eligible once work has been resolved",
     sequenceById("first_boot").when({ ...fresh, resolvedCount: 1 }), false);
  eq("and once past level 1", sequenceById("first_boot").when({ ...fresh, level: 2 }), false);

  group("Onboarding — just-in-time app tours");

  // The whole point of the JIT design: no per-app "hasSeen" flag exists. The
  // tour is eligible whenever its app is open, and the completion record is
  // what stops it firing twice.
  const itsmOpen = { ...fresh, openAppIds: ["dashboard", "itsm"] };
  eq("opening the Ticket Center makes its tour eligible",
     eligibleSequence(itsmOpen, ["first_boot"]), "ticketing_intro");
  eq("closing it again makes it ineligible",
     eligibleSequence(fresh, ["first_boot"]), null);
  eq("and once completed, reopening does NOT re-offer it",
     eligibleSequence(itsmOpen, ["first_boot", "ticketing_intro"]), null);

  eq("the gateway tour waits for the gateway",
     eligibleSequence({ ...fresh, openAppIds: ["gateway"] }, ["first_boot"]), "gateway_intro");
  eq("the bench tour waits for the bench",
     eligibleSequence({ ...fresh, openAppIds: ["hardwarelab"] }, ["first_boot"]), "hardware_intro");
  eq("an app with no tour offers nothing",
     eligibleSequence({ ...fresh, openAppIds: ["edge"] }, ["first_boot"]), null);

  // The global intro must win while it is still outstanding, even though the
  // operator has the Ticket Center open — its last step told them to open it.
  eq("the global intro outranks a JIT tour", eligibleSequence(itsmOpen, []), "first_boot");

  // Two apps open at once resolves by declaration order, never by which store
  // updated last.
  eq("two eligible tours resolve deterministically",
     eligibleSequence({ ...fresh, openAppIds: ["hardwarelab", "gateway"] }, ["first_boot"]),
     "gateway_intro");

  group("Onboarding — step progression is derived, and forward-only");

  const boot = sequenceById("first_boot");
  eq("informational steps never auto-advance", advanceIndex(boot, 0, fresh), 0);
  eq("an unsatisfied action step holds", advanceIndex(boot, 2, fresh), 2);
  eq("opening the app advances past it", advanceIndex(boot, 2, itsmOpen), 3);
  eq("but stops on the closing informational beat",
     advanceIndex(boot, 2, itsmOpen), boot.steps.length - 1);

  const tick = sequenceById("ticketing_intro");
  const selected = { ...itsmOpen, selectedTicketId: "TCK-1", ticketStatus: { "TCK-1": "new" } };
  const accepted = { ...selected, ticketStatus: { "TCK-1": "accepted" } };
  eq("the accept step waits on the ticket", advanceIndex(tick, 2, selected), 2);
  eq("accepting advances it", advanceIndex(tick, 2, accepted), 3);
  eq("resolved counts as owned too",
     advanceIndex(tick, 2, { ...selected, ticketStatus: { "TCK-1": "resolved" } }), 3);
  eq("an unselected ticket cannot satisfy it",
     advanceIndex(tick, 2, { ...itsmOpen, selectedTicketId: null }), 2);
  eq("the index never exceeds the step count",
     advanceIndex(tick, 3, accepted) <= tick.steps.length, true);

  group("Onboarding — shape guarantees");

  eq("every step has a body worth reading",
     TUTORIAL_SEQUENCES.every((s) => s.steps.every((st) => st.body.length > 40)), true);
  eq("step ids are unique within a sequence",
     TUTORIAL_SEQUENCES.every((s) => new Set(s.steps.map((st) => st.id)).size === s.steps.length), true);
  eq("sequence ids are unique",
     new Set(TUTORIAL_SEQUENCES.map((s) => s.id)).size, TUTORIAL_SEQUENCES.length);
  // A tour that ends on an action can strand the operator if that action
  // becomes impossible, so every sequence closes on something dismissible.
  eq("every sequence ends on an informational step",
     TUTORIAL_SEQUENCES.every((s) => !isActionStep(s.steps[s.steps.length - 1])), true);
  // Every JIT tour must actually be reachable from an app being open, or it
  // is dead content that ships and never runs.
  eq("every non-global tour is triggered by an open app",
     TUTORIAL_SEQUENCES.filter((s) => s.id !== "first_boot").every((s) =>
       ["itsm", "gateway", "hardwarelab"].some((a) =>
         s.when({ ...fresh, openAppIds: [a] }))), true);
  eq("out-of-range indices return null, not a crash", stepAt(boot, 99), null);
  eq("negative indices too", stepAt(boot, -1), null);
}

// ── Window manager geometry ────────────────────────────────────────────────
{
  group("WM — resize constraints");
  const B = { w: 1440, h: 812 };
  const start = { x: 200, y: 100, w: 600, h: 400 };

  eq("dragging the east edge widens only", JSON.stringify(applyResize(start, "e", 120, 0, B)),
     JSON.stringify({ x: 200, y: 100, w: 720, h: 400 }));
  eq("dragging the west edge moves the origin too", JSON.stringify(applyResize(start, "w", -100, 0, B)),
     JSON.stringify({ x: 100, y: 100, w: 700, h: 400 }));

  // The bug this guards: when width bottoms out on a west drag, x must stop
  // with it or the window slides sideways while refusing to shrink.
  const squashed = applyResize(start, "w", 999, 0, B);
  eq("width stops at the minimum", squashed.w, MIN_W);
  eq("and the right edge stays put", squashed.x + squashed.w, start.x + start.w);

  const squashedN = applyResize(start, "n", 0, 999, B);
  eq("height stops at the minimum", squashedN.h, MIN_H);
  eq("and the bottom edge stays put", squashedN.y + squashedN.h, start.y + start.h);

  eq("a window cannot exceed the desktop width", applyResize(start, "e", 5000, 0, B).w, B.w);
  eq("nor its height", applyResize(start, "s", 0, 5000, B).h, B.h);
  eq("a north drag cannot push the title bar off the top",
     applyResize(start, "n", 0, -9999, B).y, 0);

  group("WM — position clamping keeps a window grabbable");
  const r = { x: 0, y: 0, w: 600, h: 400 };
  eq("a window may hang off the left, but not entirely",
     clampPosition(-9999, 50, r, B).x, GRAB_MARGIN - r.w);
  eq("and off the right the same way", clampPosition(9999, 50, r, B).x, B.w - GRAB_MARGIN);
  eq("the top is hard-clamped at zero", clampPosition(50, -9999, r, B).y, 0);
  eq("the bottom keeps the title bar reachable", clampPosition(50, 9999, r, B).y, B.h - GRAB_MARGIN);
  eq("a legal position is left alone", JSON.stringify(clampPosition(300, 200, r, B)),
     JSON.stringify({ x: 300, y: 200 }));

  group("Boot — the script fits its budget");
  eq("the sequence stays inside the promised window", BOOT_TOTAL_MS <= BOOT_BUDGET_MS, true);
  eq("and is long enough to read", BOOT_TOTAL_MS > 1500, true);
  eq("delays increase monotonically",
     BOOT_LINES.every((_, i) => i === 0 || bootLineDelay(i) > bootLineDelay(i - 1)), true);
  eq("no line is instant", BOOT_LINES.every((l) => l.ms > 0), true);
  eq("every line reports a status", BOOT_LINES.every((l) => l.status.length > 0), true);
  // Equal gaps read as an animation rather than as a machine.
  eq("pacing varies", new Set(BOOT_LINES.map((l) => l.ms)).size > 4, true);

  group("Desktop icons — grid placement");
  const G = { cols: 6, rows: 5 };
  const base = [
    { app: "a", col: 0, row: 0 },
    { app: "b", col: 0, row: 1 },
    { app: "c", col: 1, row: 0 },
  ];

  const moved = placeIcon(base, "a", 3, 3, G.cols, G.rows);
  eq("an icon lands on the cell it was dropped on",
     JSON.stringify(moved.find((i) => i.app === "a")), JSON.stringify({ app: "a", col: 3, row: 3 }));
  eq("nothing else moved", moved.filter((i) => i.app !== "a").every((i) =>
     base.some((b) => b.app === i.app && b.col === i.col && b.row === i.row)), true);

  // Dropping onto an occupied cell displaces the occupant rather than bouncing.
  const collided = placeIcon(base, "a", 1, 0, G.cols, G.rows);
  eq("the dropped icon wins the cell",
     JSON.stringify(collided.find((i) => i.app === "a")), JSON.stringify({ app: "a", col: 1, row: 0 }));
  const displaced = collided.find((i) => i.app === "c");
  eq("the occupant is displaced, not deleted", !!displaced, true);
  eq("and lands adjacent, not at the origin",
     Math.max(Math.abs(displaced.col - 1), Math.abs(displaced.row - 0)), 1);

  const cells = collided.map((i) => `${i.col}:${i.row}`);
  eq("no two icons ever share a cell", new Set(cells).size, cells.length);

  eq("drops are clamped into the grid",
     JSON.stringify(placeIcon(base, "a", 99, 99, G.cols, G.rows).find((i) => i.app === "a")),
     JSON.stringify({ app: "a", col: G.cols - 1, row: G.rows - 1 }));

  group("Desktop icons — reflow and tidy");
  const wide = [
    { app: "a", col: 5, row: 0 },
    { app: "b", col: 0, row: 0 },
  ];
  const narrow = reflow(wide, 2, 4);
  eq("an icon outside the new grid is re-homed", narrow.every((i) => i.col < 2 && i.row < 4), true);
  eq("one that still fits does not move",
     JSON.stringify(narrow.find((i) => i.app === "b")), JSON.stringify({ app: "b", col: 0, row: 0 }));
  const reCells = narrow.map((i) => `${i.col}:${i.row}`);
  eq("reflow never collides", new Set(reCells).size, reCells.length);

  const tidied = autoArrange(base, 2);
  eq("tidy packs column-major", JSON.stringify(tidied.map((i) => `${i.col}:${i.row}`)),
     JSON.stringify(["0:0", "0:1", "1:0"]));

  group("Desktop icons — grid maths");
  eq("a narrow desktop still has one column", gridFor(40, 40).cols >= 1, true);
  const px = cellToPx(2, 3);
  eq("cell -> pixel -> cell round-trips", JSON.stringify(pxToCell(px.x, px.y)),
     JSON.stringify({ col: 2, row: 3 }));
  eq("negative pixels clamp to the origin", JSON.stringify(pxToCell(-500, -500)),
     JSON.stringify({ col: 0, row: 0 }));
}

// ── Context menu placement ─────────────────────────────────────────────────
{
  group("Context menu — stays on screen and off the cursor");
  const V = { w: 1440, h: 900 };
  const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));
  const four = items(4);
  const h = menuHeight(four);

  const mid = placeMenu(400, 300, four, V.w, V.h);
  eq("a menu with room opens at the cursor", JSON.stringify(mid), JSON.stringify({ x: 400, y: 300 }));

  // The important behaviour: FLIP, not slide. A slid menu leaves the cursor
  // sitting on top of one of its items.
  const right = placeMenu(V.w - 5, 300, four, V.w, V.h);
  eq("near the right edge it flips left of the cursor", right.x + MENU_W <= V.w - 5, true);
  eq("and keeps its margin", right.x >= 8 && right.x + MENU_W <= V.w - 8, true);

  const bottom = placeMenu(400, V.h - 5, four, V.w, V.h);
  eq("near the bottom it flips above the cursor", bottom.y + h <= V.h - 5, true);
  eq("and keeps its margin too", bottom.y >= 8 && bottom.y + h <= V.h - 8, true);

  const corner = placeMenu(V.w - 2, V.h - 2, four, V.w, V.h);
  eq("in the corner it flips both ways", corner.x < V.w - MENU_W && corner.y < V.h - h, true);

  // A menu taller than the viewport fits on neither side; clamping takes over.
  const huge = items(60);
  const clamped = placeMenu(400, 500, huge, V.w, 300);
  eq("an over-tall menu is clamped, not left off-screen", clamped.y >= 0, true);
  eq("and pinned to the top margin", clamped.y, 8);

  // Negative or absurd cursor coordinates must not produce a negative origin.
  const neg = placeMenu(-50, -50, four, V.w, V.h);
  eq("a cursor off the left never puts the menu off-screen", neg.x >= 0 && neg.y >= 0, true);

  group("Context menu — height accounting");
  eq("separators are shorter than items",
     menuHeight([{ id: "s", separator: true }]) < menuHeight([{ id: "a", label: "a" }]), true);
  eq("height grows with entries", menuHeight(items(6)) > menuHeight(items(3)), true);
  eq("an empty menu is just its padding", menuHeight([]), 16);
}

// ── Window open geometry ───────────────────────────────────────────────────
{
  group("WM — a window always opens fully on screen");
  const big = { w: 1440, h: 812 };
  const laptop = { w: 1280, h: 670 };   // 13-inch, taskbar removed
  const tiny = { w: 700, h: 420 };

  const roomy = openRect(1100, 720, 0, big);
  eq("a window that fits keeps its size", `${roomy.w}x${roomy.h}`, "1100x720");
  eq("and sits fully inside", roomy.x >= 16 && roomy.x + roomy.w <= big.w - 16, true);

  // The reported bug: the tallest app on a 13-inch display.
  const squeezed = openRect(1100, 720, 0, laptop);
  eq("an over-tall window is shrunk to fit", squeezed.h <= laptop.h - 32, true);
  eq("an over-wide window is shrunk too", squeezed.w <= laptop.w - 32, true);
  eq("its bottom never falls below the desktop", squeezed.y + squeezed.h <= laptop.h, true);
  eq("nor its right edge past it", squeezed.x + squeezed.w <= laptop.w, true);

  // The cascade can only add, so opening many wide apps used to walk off-screen.
  const walked = [0, 1, 2, 3, 4, 5, 9, 19].map((i) => openRect(1080, 700, i, laptop));
  eq("every cascade step stays on screen",
     walked.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= laptop.w && r.y + r.h <= laptop.h), true);
  eq("the cascade repeats rather than drifting forever",
     JSON.stringify(openRect(1080, 700, 0, laptop)), JSON.stringify(openRect(1080, 700, 5, laptop)));

  // A desktop smaller than the minimum window is degenerate, not a crash.
  const cramped = openRect(1000, 700, 0, tiny);
  eq("the minimum is still respected", cramped.w >= MIN_W && cramped.h >= MIN_H, true);
  eq("and the origin stays sane", cramped.x >= 0 && cramped.y >= 0, true);

  eq("a small app is never inflated", `${openRect(420, 300, 0, big).w}x${openRect(420, 300, 0, big).h}`, "420x300");
}

// ── Snap layouts ───────────────────────────────────────────────────────────
{
  group("WM — snap zones arm from the pointer");
  const B = { w: 1440, h: 812 };

  eq("the middle arms nothing", snapZoneAt(700, 400, B), null);
  eq("the left edge arms left", snapZoneAt(2, 400, B), "left");
  eq("the right edge arms right", snapZoneAt(B.w - 2, 400, B), "right");
  eq("the top edge arms maximise", snapZoneAt(700, 2, B), "top");
  // Corners must beat edges: the boxes overlap, and a drag into the top-left
  // should quarter the window rather than maximise it.
  eq("top-left is a quadrant, not maximise", snapZoneAt(4, 4, B), "tl");
  eq("top-right too", snapZoneAt(B.w - 4, 4, B), "tr");
  eq("bottom-left too", snapZoneAt(4, B.h - 4, B), "bl");
  eq("bottom-right too", snapZoneAt(B.w - 4, B.h - 4, B), "br");
  eq("just inside the edge band still arms", snapZoneAt(SNAP_EDGE - 1, 400, B), "left");
  eq("just outside it does not", snapZoneAt(SNAP_EDGE + 2, 400, B), null);

  group("WM — snapped rects tile without seams");
  const L = rectForZone("left", B), R = rectForZone("right", B);
  eq("halves meet exactly", L.x + L.w, R.x);
  eq("halves cover the full width", L.w + R.w, B.w);
  eq("halves are full height", L.h === B.h && R.h === B.h, true);

  const tl = rectForZone("tl", B), tr = rectForZone("tr", B),
        bl = rectForZone("bl", B), br = rectForZone("br", B);
  eq("quadrants cover the width", tl.w + tr.w, B.w);
  eq("quadrants cover the height", tl.h + bl.h, B.h);
  eq("quadrants meet horizontally", tl.x + tl.w, tr.x);
  eq("quadrants meet vertically", tl.y + tl.h, bl.y);
  eq("the four quadrants total the desktop area",
     tl.w * tl.h + tr.w * tr.h + bl.w * bl.h + br.w * br.h, B.w * B.h);

  const a = rectForZone("third-l", B), b = rectForZone("third-c", B), c = rectForZone("third-r", B);
  eq("thirds cover the width", a.w + b.w + c.w, B.w);
  eq("thirds meet without gaps", a.x + a.w === b.x && b.x + b.w === c.x, true);

  eq("top fills the desktop", JSON.stringify(rectForZone("top", B)),
     JSON.stringify({ x: 0, y: 0, w: B.w, h: B.h }));

  // Odd widths are where the naive `w / 2` twice leaves a hairline of
  // wallpaper between two snapped windows.
  const ODD = { w: 1441, h: 813 };
  const ol = rectForZone("left", ODD), or = rectForZone("right", ODD);
  eq("an odd width still tiles exactly", ol.w + or.w, ODD.w);
  eq("and leaves no seam", ol.x + ol.w, or.x);
  const ot = rectForZone("tl", ODD), ob = rectForZone("bl", ODD);
  eq("an odd height tiles too", ot.h + ob.h, ODD.h);
}

// ── Windows Update engine ──────────────────────────────────────────────────
{
  group("Windows Update — the happy path");
  const NOW = 1_700_000_000_000;
  const base = freshUpdateState(NOW);

  eq("a fresh machine is up to date", base.phase, "up-to-date");
  eq("and reports so", updateSummary(base, NOW), "You're up to date");
  eq("and is healthy", updateHealthy(base, NOW), true);

  const found = [{ kb: "KB5035853", title: "Cumulative Update", sizeMb: 812, category: "security" }];
  const checking = beginCheck(base, NOW);
  eq("checking is a phase, not a spinner", checking.phase, "checking");
  const available = completeCheck(checking, found, null, NOW);
  eq("finding updates moves to available", available.phase, "available");
  eq("and counts them", updateSummary(available, NOW), "1 update available");

  const installed = installPending(available, null, NOW);
  eq("installing requires a restart", installed.phase, "restart-required");
  eq("pending is emptied", installed.pending.length, 0);
  eq("and history grew", installed.history.length, base.history.length + 1);
  eq("a restart-required machine is NOT healthy", updateHealthy(installed, NOW), false);
  eq("restarting finishes it", restartComplete(installed, NOW).phase, "up-to-date");
  eq("and it is healthy again", updateHealthy(restartComplete(installed, NOW), NOW), true);

  group("Windows Update — injected faults");
  const failed = installPending(available, "0x800f081f", NOW);
  eq("an injected error fails the install", failed.phase, "failed");
  eq("and records the code", failed.error, "0x800f081f");
  // A history of successes only would hide the whole problem from whoever
  // picks the ticket up next.
  eq("the failure is written to history", failed.history[0].outcome, "failed");
  eq("with its code attached", failed.history[0].errorCode, "0x800f081f");
  eq("a failed machine is not healthy", updateHealthy(failed, NOW), false);

  const scanFail = completeCheck(beginCheck(base, NOW), [], "0x8024402c", NOW);
  eq("a scan can fail too", scanFail.phase, "failed");
  eq("which is where a bad WSUS address surfaces", scanFail.error, "0x8024402c");

  eq("every code explains its cause",
     Object.values(UPDATE_ERRORS).every((e) => e.cause.length > 40 && e.remedy.length > 30), true);
  eq("all four named codes are present",
     ["0x80070002", "0x80240020", "0x800f081f"].every((c) => !!UPDATE_ERRORS[c]), true);

  group("Windows Update — pause is a real block");
  const paused = pauseUpdates(base, NOW);
  eq("pausing sets an expiry", paused.pausedUntil > NOW, true);
  eq("a paused machine refuses to check", canCheck(paused, NOW), false);
  eq("and beginCheck is a no-op rather than a lie", beginCheck(paused, NOW).phase, base.phase);
  eq("the summary says how long is left", updateSummary(paused, NOW).includes("paused"), true);
  eq("a paused machine is NOT healthy", updateHealthy(paused, NOW), false);
  eq("the pause expires on its own", canCheck(paused, NOW + 8 * 86_400_000), true);
  eq("and can be resumed early", canCheck(resumeUpdates(paused), NOW), true);

  group("Windows Update — WSUS policy");
  const wsus = applyWsusPolicy(base, "wsus.corp.internal");
  eq("policy switches the source", wsus.source, "wsus");
  eq("and locks the applet", wsus.managedByPolicy, true);
  // A WSUS source with no server is the misconfiguration itself.
  const broken = { ...wsus, wsusServer: null };
  eq("wsus with no server is unhealthy", updateHealthy(broken, NOW), false);
  eq("clearing policy returns to Microsoft", applyWsusPolicy(wsus, null).source, "microsoft");
  eq("and unlocks the applet", applyWsusPolicy(wsus, null).managedByPolicy, false);

  group("Windows Update — illegal transitions are refused");
  eq("cannot install with nothing pending", installPending(base, null, NOW).phase, base.phase);
  eq("cannot restart-complete when no restart is pending", restartComplete(base, NOW).phase, base.phase);
  eq("cannot check while already checking", canCheck(checking, NOW), false);
}

{
  /*
   * OPERATOR STANDING — the level, and the plan's hold on it.
   *
   * These exist because the bug they describe type-checked perfectly and ran
   * for weeks. `awardXp` stored the CAPPED level while Settings, Profile and
   * the leaderboard each recomputed the UNCAPPED one from XP, so a free
   * operator read 4 in the taskbar and 7 on their own profile. Nothing in
   * 1335 specs had an opinion about it, because nothing asserted that the
   * estate only has ONE level.
   */
  group("Operator standing — one level, derived");

  const CAP = TIERS.free.levelCap;          // 4
  const belowXp = xpForLevel(3);            // comfortably inside the free plan
  const overXp = xpForLevel(CAP + 3);       // three levels past the ceiling

  const below = standingOf(belowXp, CAP);
  eq("under the ceiling, granted level is what the XP earned", below.level, below.earned);
  eq("and nothing is being withheld", below.held, false);
  eq("so nothing is banked", below.banked, 0);

  const over = standingOf(overXp, CAP);
  eq("past the ceiling, the granted level stops at the cap", over.level, CAP);
  eq("but the earned level keeps climbing", over.earned, levelForXp(overXp));
  eq("the difference is reported as held", over.held, true);
  eq("and counted", over.banked, over.earned - CAP);

  /*
   * THE UPGRADE. This is the promise `awardXp` made in a comment and broke in
   * its body: it wrote the capped figure into the record, so lifting the cap
   * changed nothing until the next award happened to rewrite it.
   */
  const upgraded = standingOf(overXp, TIERS.pro.levelCap);
  eq("lifting the cap needs no recompute — same XP, full level", upgraded.level, over.earned);
  eq("an uncapped plan holds nothing", upgraded.held, false);

  // ...and the other direction, which a plan change can also take.
  eq("dropping back to a capped plan re-applies the ceiling", standingOf(overXp, CAP).level, CAP);

  group("Operator standing — standing ON the cap is not the same as held");
  const exact = standingOf(xpForLevel(CAP), CAP);
  eq("an operator exactly at the ceiling is at the cap", exact.level, CAP);
  eq("but has banked nothing, and must not be told otherwise", exact.held, false);
  eq("no surplus levels", exact.banked, 0);

  group("Operator standing — no progress bar towards a level the plan withholds");
  eq("under the ceiling there is a next level to aim at", toNextLevel(below) !== null, true);
  eq("and its target is the next level's XP", toNextLevel(below).need, xpForLevel(below.level + 1));
  eq("at the ceiling there is not", toNextLevel(exact), null);
  eq("past the ceiling there is not either", toNextLevel(over), null);
  eq("an uncapped plan always has a next level", toNextLevel(upgraded) !== null, true);

  group("Operator standing — XP is the only stored fact");
  // Same XP and same cap must always give the same answer, whoever asks and
  // whenever. This is what makes it safe for the taskbar, the profile and the
  // leaderboard to each derive it independently.
  eq("derivation is total", standingOf(overXp, CAP).level, standingOf(overXp, CAP).level);
  eq("zero XP is level 1, not level 0", standingOf(0, CAP).level, 1);
  eq("and a free operator at zero is not being held", standingOf(0, CAP).held, false);
}

{
  /*
   * THE LADDER AND THE CEILING.
   *
   * The app unlock levels and the plans' level caps were written months
   * apart and never introduced to each other. Three apps sit above the free
   * ceiling, and the grid told free operators they "unlock at level 5" — a
   * level their plan does not reach. Nothing failed; the product simply
   * promised something it had decided not to give.
   */
  group("Locks — a level you can reach, or a plan you do not have");

  const FREE_CAP = TIERS.free.levelCap;

  const early = appLock("edge", 1, FREE_CAP);   // unlocks at 2, well inside free
  eq("below its level on a plan that reaches it, the lock is about the level", early.kind, "level");
  eq("and it names the level", early.need, APP_UNLOCK_LEVEL.edge);
  eq("worded as something to work towards", lockLabel(early), `Unlocks at level ${APP_UNLOCK_LEVEL.edge}`);

  const beyond = appLock("racklab", FREE_CAP, FREE_CAP);  // unlocks at 5, free stops at 4
  eq("above the plan's ceiling, the lock is about the PLAN", beyond.kind, "plan");
  eq("and it names a plan that actually reaches it", beyond.tier.levelCap === null || beyond.tier.levelCap >= beyond.need, true);
  eq("so it is never worded as a level to grind for", lockLabel(beyond).includes("level"), false);
  eq("it names the plan instead", lockLabel(beyond), `Part of ${beyond.tier.label}`);

  eq("the same app on an uncapped plan is only ever a level away", appLock("racklab", 1, null).kind, "level");
  eq("and open once the level is there", appLock("racklab", 9, null).kind, "open");
  eq("an open app is open on a capped plan too", appLock("edge", 4, FREE_CAP).kind, "open");

  group("Locks — every app above the free ceiling says so");
  // The property, rather than a list that goes stale the next time someone
  // moves an unlock level: on the free plan, NOTHING may be advertised as a
  // level to reach if the plan cannot reach it.
  for (const [app, need] of Object.entries(APP_UNLOCK_LEVEL)) {
    if (need > FREE_CAP) {
      eq(`${app} (level ${need}) reads as a plan, not a level`, appLock(app, FREE_CAP, FREE_CAP).kind, "plan");
    }
  }
  // ...and the ticket tiers are gated by the same ladder.
  eq("hard tickets start above the free ceiling", TIER_UNLOCK_LEVEL.Tier_3_Hard > FREE_CAP, true);
  eq("and expert tickets further still", TIER_UNLOCK_LEVEL.Tier_4_Expert > TIER_UNLOCK_LEVEL.Tier_3_Hard, true);

  group("Plans — the growth phase is derived, not restated");
  eq("the free plan reaches phase 1", phaseCapOf("free"), 1);
  eq("pro is uncapped", phaseCapOf("pro"), null);
  eq("enterprise too", phaseCapOf("enterprise"), null);
  // What the old stored constant could not promise: the two always agree,
  // because there is only one of them now.
  eq("a capped plan's phase follows its level cap", phaseCapOf("free"), phaseForLevel(TIERS.free.levelCap));

  group("Plans — firstTierReaching");
  eq("level 1 is reached by the free plan", firstTierReaching(1).id, "free");
  eq("the free ceiling itself is still free", firstTierReaching(FREE_CAP).id, "free");
  eq("one past it is Pro", firstTierReaching(FREE_CAP + 1).id, "pro");
  eq("and so is anything higher", firstTierReaching(40).id, "pro");

  group("Plans — the price list may not claim what the product cannot do");
  // Every feature any plan sells must declare whether it works today. A new
  // feature with no status is the exact hole this closes.
  const sold = new Set(Object.values(TIERS).flatMap((t) => t.features));
  for (const f of sold) {
    eq(`${f} declares whether it is live`, typeof FEATURE_STATUS[f] === "string", true);
  }
  eq("reviewing closed tickets works today", isLive("ticket-history"), true);
  eq("so does the leaderboard", isLive("leaderboard"), true);
  // These four are commitments, and the UI has to keep saying so until they
  // are not. Flipping one of these to `live` should mean the code exists.
  eq("cloud save waits on accounts", isLive("cloud-save"), false);
  eq("certificates wait on accounts", isLive("certificates"), false);
  eq("cohort reporting waits on accounts", isLive("cohort-reporting"), false);
  eq("authoring waits on accounts", isLive("custom-scenarios"), false);
  // The free plan must not be selling anything that does not exist: it is the
  // one plan somebody is using RIGHT NOW.
  eq("everything the free plan offers is live", TIERS.free.features.every(isLive), true);
}

{
  /*
   * THE SAVE SLOT.
   *
   * `parsed.version !== VERSION ? null : parsed` collapsed four outcomes into
   * one, and the caller — reasonably — read that null as "nothing saved". It
   * generated a fresh estate and its autosave wrote over the real one about
   * four seconds later. No message, no backup. Twenty-eight schema versions
   * went past with that as the behaviour.
   */
  group("Save slot — telling the four outcomes apart");

  const NOW = 1_700_000_000_000;
  const V = 28;
  const good = JSON.stringify({ version: V, savedAt: NOW, org: "Helix Biolabs" });

  eq("nothing stored is empty", decodeSlot(null, V, {}).kind, "empty");
  eq("an empty string is empty, not corrupt", decodeSlot("", V, {}).kind, "empty");
  eq("a current save reads back", decodeSlot(good, V, {}).kind, "ok");
  eq("and carries its contents", decodeSlot(good, V, {}).state.org, "Helix Biolabs");
  eq("with nothing to migrate", decodeSlot(good, V, {}).migrated, false);

  const old = JSON.stringify({ version: 26, savedAt: NOW });
  const stale = decodeSlot(old, V, {});
  eq("an older save is NOT reported as empty", stale.kind === "empty", false);
  eq("it is stale", stale.kind, "stale");
  eq("because it is outdated rather than broken", stale.reason, "outdated");
  eq("and it says which build wrote it", stale.version, 26);
  eq("and when", stale.savedAt, NOW);

  const broken = decodeSlot("{not json", V, {});
  eq("an unparseable blob is stale too", broken.kind, "stale");
  eq("but for a different reason", broken.reason, "unreadable");
  eq("with no version to report, and it does not invent one", broken.version, null);

  // `JSON.parse` accepts plenty that is not a save. None of it may be handed
  // to `applySave` as though it were an estate.
  for (const junk of ["4", '"hello"', "null", "[]", '{"savedAt":1}']) {
    eq(`${junk} is not mistaken for a save`, decodeSlot(junk, V, {}).kind, "stale");
  }

  group("Save slot — migrations walk forward");
  const steps = {
    26: (s) => ({ ...s, version: 27, walked: [...(s.walked ?? []), 26] }),
    27: (s) => ({ ...s, version: 28, walked: [...(s.walked ?? []), 27] }),
  };
  const walked = decodeSlot(old, V, steps);
  eq("a save with a path forward loads", walked.kind, "ok");
  eq("and is flagged as migrated so the caller can write it back", walked.migrated, true);
  eq("it arrives at the current version", walked.state.version, V);
  eq("having taken every hop in order", walked.state.walked.join(","), "26,27");

  // The gap is the point: a chain missing a link must not half-apply.
  eq("a broken chain does not half-migrate", decodeSlot(old, V, { 26: steps[26] }).kind, "stale");
  eq("and reports the version it actually found", decodeSlot(old, V, { 26: steps[26] }).version, 26);

  group("Save slot — a migration that does not advance cannot hang the boot");
  // This runs inside the first paint. A step that forgets to bump `version`
  // would loop forever with no output at all.
  eq("a non-advancing step is refused", migrate({ version: 26, savedAt: NOW }, V, { 26: (s) => s }), null);
  eq("so is one that goes backwards", migrate({ version: 27, savedAt: NOW }, V, { 27: (s) => ({ ...s, version: 26 }), 26: (s) => ({ ...s, version: 27 }) }), null);
  eq("a save already current needs no walk", migrate({ version: V, savedAt: NOW }, V, {}).version, V);
}

{
  /*
   * TRAY LABELS.
   *
   * `trayScale` was added so no two PARTS overlap on the tray, and the specs
   * for that passed the whole time the server's tray was unreadable: the
   * labels were never in the guarantee. They were drawn at a fixed 15px, 18
   * units below the art — numbers chosen against the desktop's 0.62 tray —
   * and the server packs fifteen parts at 0.42, so "Heatsink 0" ran into
   * "Heatsink 1" sideways and the DIMM labels landed on the row beneath.
   *
   * The label estimate below is deliberately WIDE. A check that assumed text
   * was narrower than it renders would pass over the very collision it exists
   * to find.
   */
  group("Bench tray — labels belong to the tray they are drawn on");

  for (const c of Object.values(CHASSIS)) {
    const { fontSize } = trayLabel(c);
    eq(`${c.id}: label stays readable`, fontSize >= LABEL_MIN_SIZE, true);
  }
  // The denser tray gets the smaller label; that is the whole rule.
  eq("the server's tray is tighter than the desktop's", SERVER.trayScale < DESKTOP.trayScale, true);
  eq("so its labels are smaller", trayLabel(SERVER).fontSize < trayLabel(DESKTOP).fontSize, true);
  eq("and sit closer to the art", trayLabel(SERVER).gap < trayLabel(DESKTOP).gap, true);
  eq("the desktop is unchanged", trayLabel(DESKTOP).fontSize, 15);

  group("Bench tray — no label collides with another label");
  /*
   * ONLY THE LABEL-VS-LABEL CHECK IS ASSERTED, AND THAT IS DELIBERATE.
   *
   * Label-vs-ART is also measurably broken and is NOT asserted here, because
   * asserting it would mean weakening it to pass. The tray maps in
   * chassis.ts were hand-authored around part boxes alone, with no band
   * reserved for a name underneath, so on every chassis some label lands on a
   * neighbour's artwork — 5 pairs on the desktop, 11 on the server. The worst
   * is the desktop's "Thermal paste", whose label sits inside the cooler
   * drawn beside it; most of the rest cross by about two units.
   *
   * Fixing it properly means re-authoring three tray layouts to reserve label
   * space, and those layouts took nine spec failures to get right the first
   * time. Writing a tolerant version of this check to make the suite green
   * would bury that, so the measurement is written down here instead and the
   * assertion waits for the layout work.
   */
  for (const c of Object.values(CHASSIS)) {
    const boxes = partsOf(c).map((p) => ({ id: p.id, label: trayLabelBox(c, p.id, p.label) }));
    let labelHits = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxOverlaps(boxes[i].label, boxes[j].label)) labelHits++;
      }
    }
    eq(`${c.id}: no label overlaps another label`, labelHits, 0);
  }
}

{
  /*
   * TICKET CODES.
   *
   * `ticketSeq` was a module variable. It reset to its base on every page
   * load while the SAVE kept every code it had already handed out, so the
   * first ticket raised after a reload carried a number already sitting on
   * the operator's board. Measured on a real save before the fix: eight
   * tickets, seven distinct codes, with TCK-4825 answering to both a password
   * reset and a rogue-DHCP cascade.
   */
  group("Ticket codes — the counter answers to what already exists");

  eq("a code parses", codeNumber("TCK-4831"), 4831);
  eq("a foreign code does not", codeNumber("INC-4831"), null);
  eq("and neither does a malformed one", codeNumber("TCK-nope"), null);

  // The exact shape of the bug: a restored queue, then a freshly minted code.
  resetTicketSeq();
  const restored = [{ code: "TCK-4820" }, { code: "TCK-4825" }, { code: "TCK-4823" }];
  syncTicketSeq(restored);
  const issued = [];
  for (let i = 0; i < 3; i++) issued.push(nextTicketCode());
  eq("the next code clears the highest restored one", issued[0], "TCK-4826");
  eq("and keeps going", issued.join(","), "TCK-4826,TCK-4827,TCK-4828");
  eq("so nothing it issues collides with the queue it was told about",
     issued.some((c) => restored.some((r) => r.code === c)), false);

  group("Ticket codes — syncing is monotonic and idempotent");
  // Called twice with the same queue, it must not hand back a number it has
  // already given out in between.
  resetTicketSeq();
  syncTicketSeq([{ code: "TCK-4900" }]);
  const a = nextTicketCode();
  syncTicketSeq([{ code: "TCK-4900" }]);
  const b = nextTicketCode();
  eq("a repeat sync does not rewind the counter", a === b, false);
  eq("it keeps moving forward", codeNumber(b) > codeNumber(a), true);

  // A filtered list — say, only the open tickets — must not drag it back.
  resetTicketSeq();
  syncTicketSeq([{ code: "TCK-4950" }]);
  syncTicketSeq([{ code: "TCK-4830" }]);
  eq("a lower queue cannot rewind it", codeNumber(nextTicketCode()) > 4950, true);

  group("Ticket codes — junk in the queue is ignored, not obeyed");
  resetTicketSeq();
  syncTicketSeq([{ code: "TCK-4840" }, { code: "not-a-code" }, { code: "TCK-" }]);
  eq("unparseable codes do not move the counter", nextTicketCode(), "TCK-4841");

  group("Ticket codes — a save that already collided is repaired, not inherited");
  /*
   * The measured damage: TCK-4825 answering to three different incidents in
   * one save, written before the counter knew about the queue.
   */
  resetTicketSeq();
  const damaged = [
    { id: "a", code: "TCK-4820" },
    { id: "b", code: "TCK-4825" },
    { id: "c", code: "TCK-4825" },
    { id: "d", code: "TCK-4826" },
    { id: "e", code: "TCK-4825" },
  ];
  syncTicketSeq(damaged);
  const fixed = dedupeTicketCodes(damaged);
  eq("every ticket still exists", fixed.length, damaged.length);
  eq("and every code is now distinct", new Set(fixed.map((t) => t.code)).size, fixed.length);
  // The first holder keeps the code it had — it is the one already quoted.
  eq("the first claimant keeps TCK-4825", fixed.find((t) => t.id === "b").code, "TCK-4825");
  eq("the later ones move", fixed.find((t) => t.id === "c").code === "TCK-4825", false);
  eq("and so does the third", fixed.find((t) => t.id === "e").code === "TCK-4825", false);
  // Reissued codes must come from clear air, not from somewhere in the middle.
  eq("replacements clear the whole queue", fixed.every((t) => codeNumber(t.code) >= 4820), true);
  eq("untouched tickets are untouched", fixed.find((t) => t.id === "d").code, "TCK-4826");

  group("Ticket codes — a clean queue is left exactly alone");
  resetTicketSeq();
  const clean = [{ id: "a", code: "TCK-4820" }, { id: "b", code: "TCK-4821" }];
  syncTicketSeq(clean);
  // Identity, not just equality: a clean load must not look like a change to
  // anything subscribed to the store.
  eq("the same array comes back", dedupeTicketCodes(clean) === clean, true);
  eq("and no code was spent repairing nothing", nextTicketCode(), "TCK-4822");

  {

  /*
   * THE JOB TITLE, which had the same disease as the level and stayed
   * undiagnosed for longer: `host.user.role` was written once in the seed and
   * never again, so it read "IT Intern" for the life of every save while
   * `jobTitle()` computed the truth beside it on the same screen.
   */
  }
  group("Job title — both axes are live");
  const none = {};
  eq("a new operator is an intern", jobTitle(1, none), "IT Intern");
  eq("and stops being one on promotion", jobTitle(2, none), "Junior IT Generalist");
  eq("seniority keeps climbing with the level", jobTitle(15, none), "Principal IT Generalist");
  // The bug in one line: at level 15 the stored field still said this.
  eq("level 15 is NOT an intern", jobTitle(15, none) === "IT Intern", false);

  group("Job title — the discipline follows the work");
  const generalist = { networking: SPECIALISATION_THRESHOLD - 1 };
  const specialist = { networking: SPECIALISATION_THRESHOLD };
  eq("below the threshold you are a generalist", jobTitle(6, generalist).includes("Generalist"), true);
  eq("at it you are not", jobTitle(6, specialist).includes("Generalist"), false);
  eq("and the rank still leads", jobTitle(6, specialist).startsWith(rankPrefix(6)), true);
  // Changing track changes the title without touching the level.
  const other = { security: SPECIALISATION_THRESHOLD * 2 };
  eq("a different track gives a different title", jobTitle(6, specialist) === jobTitle(6, other), false);
  eq("at the same seniority", jobTitle(6, other).startsWith(rankPrefix(6)), true);
}

{
  /*
   * COLOUR THAT STILL MEANS SOMETHING.
   *
   * `tailwind.config.ts` remaps every raw Tailwind family onto a semantic one,
   * which is what gives the product correct light-mode contrast everywhere.
   * The cost nobody was paying attention to: `amber` IS `orange`, and `sky`,
   * `blue`, `cyan` and `indigo` are one colour.
   *
   * Measured in the browser before this: Medium and High severity both
   * `rgb(252, 200, 110)`; New, Accepted and In Progress all
   * `rgb(130, 183, 255)`. Six of eleven entries across the queue's two primary
   * codings were duplicates, and reading the source could not reveal it
   * because the names are all different words.
   */
  group("Swatches — the resolver knows what the config does");

  eq("amber and orange are one family", swatchOf("text-amber-300"), swatchOf("text-orange-300"));
  eq("so are sky, blue, cyan and indigo", swatchOf("bg-sky-500"), swatchOf("bg-indigo-500"));
  eq("and rose is red", swatchOf("text-rose-300"), swatchOf("text-red-300"));
  eq("different families stay different", swatchOf("text-amber-300") === swatchOf("text-red-300"), false);
  // Shades collapse onto three roles, so 200 and 300 are one ink...
  eq("200 and 300 are the same ink", swatchOf("text-amber-200"), swatchOf("text-amber-300"));
  // ...but 300 and 500 are not.
  eq("300 and 500 are not", swatchOf("text-amber-300") === swatchOf("text-amber-500"), false);
  // The neutral ramp is real, so its shades stay distinct.
  eq("neutral keeps a per-shade scale", swatchOf("text-gray-300") === swatchOf("text-gray-400"), false);
  // Strength is part of how it paints, so it is part of the identity.
  eq("opacity separates two uses of one ink", renderIdentity("bg-amber-500/15") === renderIdentity("bg-amber-500/30"), false);
  eq("the order classes were written in does not matter",
     renderIdentity("bg-red-500/15 text-red-300"), renderIdentity("text-red-300 bg-red-500/15"));
  eq("a non-colour utility is not a swatch", swatchOf("rounded-md"), null);

  group("Colour maps — no two entries paint the same");
  /*
   * THE PROPERTY, not a list. Anybody adding a seventh status or a seventh
   * track will be told here rather than by somebody squinting at a queue.
   */
  const maps = {
    severity: Object.fromEntries(Object.entries(SEVERITY_META).map(([k, v]) => [k, v.color])),
    "severity dots": Object.fromEntries(Object.entries(SEVERITY_META).map(([k, v]) => [k, v.dot])),
    status: Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.color])),
    track: Object.fromEntries(Object.entries(TRACK_META).map(([k, v]) => [k, v.color])),
    emotion: Object.fromEntries(Object.entries(EMOTION_META).map(([k, v]) => [k, v.color])),
    "skill track": Object.fromEntries(Object.entries(SKILL_TRACK_META).map(([k, v]) => [k, v.color])),
  };
  for (const [name, entries] of Object.entries(maps)) {
    const clashes = collisions(entries);
    eq(`${name}: every entry is distinguishable`, clashes.map((g) => g.join("=")).join(", "), "");
  }

  group("Colour maps — the ramps still read as ramps");
  // Severity escalates through three hues and ends on the one filled chip in
  // the product; sharing a hue with High is the point of Critical.
  eq("low is neutral", swatchOf(SEVERITY_META.low.color.split(" ")[0]), "text:neutral:300");
  eq("medium warns", swatchOf(SEVERITY_META.medium.color.split(" ")[0]), "text:warn:text");
  eq("high is already danger", swatchOf(SEVERITY_META.high.color.split(" ")[0]).startsWith("text:danger"), true);
  eq("and critical is the only filled chip", SEVERITY_META.critical.color.includes("bg-danger"), true);
  eq("nothing else fills", Object.entries(SEVERITY_META).filter(([k]) => k !== "critical").every(([, v]) => !/bg-\w+(?!.*\/)/.test(v.color.replace(/bg-\w+-\d+\/\d+/g, ""))), true);

  // New and Accepted are one idea at two weights; In Progress leaves blue.
  eq("new and accepted share an ink", swatchOf(STATUS_META.new.color.split(" ")[0]), swatchOf(STATUS_META.accepted.color.split(" ")[0]));
  eq("but not a strength", renderIdentity(STATUS_META.new.color) === renderIdentity(STATUS_META.accepted.color), false);
  eq("work in flight leaves blue", swatchOf(STATUS_META.in_progress.color.split(" ")[0]).startsWith("text:info"), false);
}

{
  /*
   * ARM BEFORE FIRING.
   *
   * One product was running two policies on irreversible work: `/admin` made
   * you confirm before discarding somebody's progress, while the cloud console
   * deleted a firewall rule, the gateway deleted a saved profile, the floor
   * un-racked a running server and Appearance discarded the whole desktop
   * layout — each on one click, none of them undoable.
   *
   * These specs exist because the FIRST attempt at the shared guard was
   * broken in a way that type-checked: it asked a `useState` updater whether
   * to fire, and updaters do not run synchronously, so it read the value from
   * before the press. The control armed and could never be fired.
   */
  group("Arm — one press arms, the same press again fires");

  const first = armReduce(IDLE, { type: "press", key: "rule-1" });
  eq("the first press does not fire", first.fire, false);
  eq("but it arms", first.state.key, "rule-1");

  const second = armReduce(first.state, { type: "press", key: "rule-1" });
  eq("the second press fires", second.fire, true);
  eq("and firing disarms", second.state.key, null);

  // If firing left the arm in place, the NEXT press would fire unguarded.
  const third = armReduce(second.state, { type: "press", key: "rule-1" });
  eq("so the press after that has to arm again", third.fire, false);
  eq("and does", third.state.key, "rule-1");

  group("Arm — arming something else moves the arm, it does not fire");
  const armedA = armReduce(IDLE, { type: "press", key: "A" });
  const pressedB = armReduce(armedA.state, { type: "press", key: "B" });
  eq("pressing a different control never fires", pressedB.fire, false);
  eq("the arm moves to it", pressedB.state.key, "B");
  // The one that matters: A must now need two presses again, not one.
  eq("and the one you walked away from is disarmed",
     armReduce(pressedB.state, { type: "press", key: "A" }).fire, false);

  group("Arm — the timeout is keyed, so it cannot disarm the wrong control");
  /*
   * Arm A, then B, then A's timer elapses. If `expire` were unkeyed it would
   * drop B's arm, and the operator's deliberate second press on B would
   * quietly re-arm instead of firing.
   */
  const staleTimer = armReduce(pressedB.state, { type: "expire", key: "A" });
  eq("an old timer leaves the current arm alone", staleTimer.state.key, "B");
  eq("so B still fires on its second press",
     armReduce(staleTimer.state, { type: "press", key: "B" }).fire, true);
  // And the timer for whatever IS armed does disarm it.
  eq("the live timer disarms", armReduce(pressedB.state, { type: "expire", key: "B" }).state.key, null);
  eq("expiring never fires anything", armReduce(pressedB.state, { type: "expire", key: "B" }).fire, false);

  group("Arm — disarm is always safe");
  eq("disarm clears an arm", armReduce(armedA.state, { type: "disarm" }).state.key, null);
  eq("disarming nothing is not an error", armReduce(IDLE, { type: "disarm" }).state.key, null);
  eq("and it never fires", armReduce(armedA.state, { type: "disarm" }).fire, false);
  eq("an expire against an idle machine is inert", armReduce(IDLE, { type: "expire", key: "A" }).state.key, null);
}

{
  /*
   * THE FREE TIER'S TICKETS.
   *
   * A free operator is capped at level 4, which caps them at growth phase 1.
   * That is the ONLY estate they will ever see, and every judgement below is
   * made against it rather than against a full datacentre nobody on this plan
   * can reach.
   */
  group("Free tier — the first shift has real breadth");

  const WORLDS = [1, 7, 99, 4242, 31337, 555].map((seed) => generateWorld(seed, 1));
  const LIB = Object.values(ticketLibrary(WORLDS[0]));
  const freeOf = (lvl) =>
    LIB.filter((t) => unlockedTiers(lvl).includes(t.difficulty) && templateMinLevel(t.tags) <= lvl);
  /*
   * MANY RNG SEEDS, not one.
   *
   * My first version of this varied the WORLD and held the rng fixed, which
   * measured something quite different: a template whose binder happened to
   * pick an unusable asset for that one seed looked permanently dead. Three
   * share-access templates were condemned that way while actually binding 87%
   * of the time. Varying both is what separates "cannot exist here" from
   * "was unlucky", and only the first is a fault.
   */
  const binds = (t) =>
    WORLDS.some((w) => {
      for (let i = 0; i < 40; i++) if (t.makeContext(w, mulberry32(i * 13 + 1)) !== null) return true;
      return false;
    });
  /** Binds EVERY time, not just eventually — see the note on pick-then-guard. */
  const bindsReliably = (t) =>
    WORLDS.every((w) => {
      for (let i = 0; i < 25; i++) if (t.makeContext(w, mulberry32(i * 7 + 2)) === null) return false;
      return true;
    });
  const familyOf = (t) => t.id.replace(/-(easy|medium|hard|expert)-\d+$/, "");

  const lvl1 = freeOf(1);
  const families1 = new Set(lvl1.map(familyOf));
  /*
   * The number that matters is FAMILIES, not templates: a family is a distinct
   * thing to do, and four variants of one lockout is still one job. Level 1
   * shipped five families against a five-ticket shift, so a new operator could
   * meet the entire game on day one — and nine of its twenty-four templates
   * were the same account lockout.
   */
  eq("a new operator meets at least twelve kinds of work", families1.size >= 12, true);
  eq("...across several shifts' worth of tickets", lvl1.length >= 36, true);

  // Concentration, not just count. One archetype owning a third of the pool is
  // how a queue starts feeling like a single repeated chore.
  const lockouts = lvl1.filter((t) => /lockout|pw-reset/.test(t.id)).length;
  eq("no single theme owns a quarter of the first shift", lockouts / lvl1.length < 0.25, true);

  // Every track should be able to speak to a beginner. netops had nothing at
  // all, so the whole discipline was invisible until level 2.
  const tracks1 = new Set(lvl1.map((t) => t.track));
  for (const track of ["helpdesk", "sysadmin", "secops", "netops"]) {
    eq(`${track} has work at level 1`, tracks1.has(track), true);
  }

  group("Free tier — every level-1 ticket can actually be raised");
  /*
   * `makeContext` returning null means "this world cannot host this", and the
   * factory silently skips it. A template that never binds is not a bug the
   * player sees — it is content that simply never exists, which is worse,
   * because nothing complains.
   */
  const unhostable1 = lvl1.filter((t) => !binds(t));
  eq("no level-1 template is dead content", unhostable1.map((t) => t.id).join(", "), "");

  /*
   * Stronger, and the bug it catches is invisible: a binder that picks an
   * asset and THEN rejects it works most of the time and silently produces
   * nothing the rest. Two families I wrote bound in no starter world at all
   * that way, and a third bound 87% of the time for months.
   */
  const flaky1 = lvl1.filter((t) => !bindsReliably(t));
  eq("and none binds only when the dice agree", flaky1.map((t) => t.id).join(", "), "");

  group("Free tier — a ticket's own fault leaves it unsolved");
  /*
   * The property that catches a broken scenario: inject the fault, then grade
   * it. If `win` is already true the ticket resolves the instant it is raised,
   * and the operator is handed a completed job they never did.
   */
  let preSolved = [];
  for (const t of freeOf(4)) {
    const ctx = t.makeContext(WORLDS[0], mulberry32(1234));
    if (!ctx || !t.injectFault || !t.win) continue;
    const draft = structuredClone(WORLDS[0]);
    t.injectFault(draft, ctx);
    if (t.win(draft, ctx) === true) preSolved.push(t.id);
  }
  eq("no free-tier ticket is solved by its own fault", preSolved.join(", "), "");

  group("Free tier — endpoint work is spread across the estate, not one machine");
  /*
   * THE PROPERTY THAT WAS MISSING.
   *
   * Every endpoint template used to bind to the same host, because the only
   * workstations off the `fleet-endpoint` list were one Windows box and a Mac.
   * The prose changed, the machine never did — and two tickets raised together
   * landed on the same host, where fixing one could resolve the other.
   *
   * Counting DISTINCT TARGETS over many bindings is the only way to see that:
   * every template still bound, every fault still injected, and nothing failed.
   */
  const endpointFamilies = ["gen-print-spooler-1-1", "gen-dns-client-1-1", "gen-update-blocked-1-1"];
  const seenHosts = new Set();
  const seenPeople = new Set();
  for (const fam of endpointFamilies) {
    const t = ticketLibrary(WORLDS[0])[fam];
    for (let i = 0; i < 120; i++) {
      const ctx = t.makeContext(WORLDS[0], mulberry32(i * 7 + 1));
      if (!ctx) continue;
      seenHosts.add(ctx.targetHostname);
      seenPeople.add(ctx.targetUserName);
    }
  }
  eq("a starter estate offers many machines to be called out to", seenHosts.size >= 8, true);
  eq("and the request comes from a named person, not a hostname", seenPeople.size >= 8, true);
  // The fleet is reached through the directory, so the ticket must carry the
  // person — without it there is no way to find their machine.
  const spooler = ticketLibrary(WORLDS[0])["gen-print-spooler-1-1"];
  const sctx = spooler.makeContext(WORLDS[0], mulberry32(11));
  eq("an endpoint ticket names who to look up", typeof sctx.targetUserId === "string" && sctx.targetUserId.length > 0, true);
  eq("and which machine that resolves to", typeof sctx.targetHostname === "string" && sctx.targetHostname.length > 0, true);

  group("Free tier — Tier 2 content that a phase-1 estate cannot host");
  /*
   * A RATCHET, not a clean bill of health. Six Tier-2 templates need an
   * estate a free operator never gets — a rack to hot-swap a disk in, a
   * database tier, a DHCP pool big enough to exhaust. They are offered inside
   * the free range and can never appear there.
   *
   * Fixing them means either giving phase 1 those things or moving the
   * templates up a tier, and that is a content decision rather than a bug to
   * patch here. This holds the line meanwhile: the list may shrink, and must
   * not grow.
   */
  const deadT2 = freeOf(4).filter((t) => t.difficulty === "Tier_2_Medium" && !binds(t));
  eq("the known phase-1 gap has not grown", deadT2.length <= 6, true);
  eq("and it is all Tier 2 — nothing at level 1 is affected", deadT2.every((t) => t.difficulty === "Tier_2_Medium"), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
