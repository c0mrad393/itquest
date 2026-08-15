/**
 * TriageOS — datacentre physics & unification spec (v0.3.1, extended v0.4.0)
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
  group("Polish — app gating is total");

  // Every gated app refuses below its level and permits at it. This is the
  // property the Monitor bypass violated: a level-2 operator reached
  // Procurement, which opens at 4.
  for (const app of ["monitor", "netops", "switches", "hardwarelab", "assetmanager",
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

  // The specific reported bypass, pinned.
  eq("Monitor opens before Procurement — the bypass path", appUnlockLevel("monitor") < appUnlockLevel("procurement"), true);
  eq("...so a Monitor-level operator must NOT reach Procurement",
     isAppUnlocked("procurement", appUnlockLevel("monitor")), false);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
