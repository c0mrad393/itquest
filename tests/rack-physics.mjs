/**
 * TriageOS — datacentre physics spec (v0.3.1)
 * ===========================================
 * Exercises the pure power/thermal layer in `lib/core/rack.ts` — the same
 * functions the Rack Lab renders and the ticket win-conditions grade, so a
 * regression here would silently change what the game asks of the player.
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
} from "../.test-build/rack.js";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
