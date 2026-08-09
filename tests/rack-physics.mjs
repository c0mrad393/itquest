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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
