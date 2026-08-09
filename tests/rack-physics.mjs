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
    "Not a member of any group with rights here (Finance_RW). Add them in Active Directory, or grant their group access on this share.",
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
