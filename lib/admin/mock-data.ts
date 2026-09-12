/**
 * ITQuest Admin — mock data
 * =========================
 * Everything the Phase 1 admin panel renders. One file, no React, no stores,
 * so every component below stays a pure view of data it was handed.
 *
 * ── SHAPED LIKE AN API RESPONSE, NOT LIKE A COMPONENT ───────────────────────
 *
 * The types here are what a real endpoint would plausibly return: ISO-ish
 * epoch timestamps rather than "3 minutes ago", ids rather than array indices,
 * enums rather than Tailwind class names. It is tempting to pre-bake the
 * display strings while there is no backend — it makes the components shorter
 * today and makes every one of them a rewrite the day the API lands, because
 * the formatting has to move out of the fixture and into the view anyway.
 *
 * So the components do their own formatting, against a shape that will not
 * change. Swapping this module for `fetch` should be a one-file change.
 *
 * ── AND IT IS OBVIOUSLY FAKE ────────────────────────────────────────────────
 *
 * Names are drawn from the same fictional-company pool the simulator uses.
 * Nothing here should ever be mistaken for a real person, and the panel tells
 * the operator it is mock data rather than leaving them to work it out from a
 * suspiciously round number.
 */

export type UserRole = "student" | "instructor" | "admin";
export type UserStatus = "active" | "idle" | "suspended";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Epoch ms. The view formats it. */
  lastSeen: number;
  /** Operator level inside the simulator. */
  level: number;
  scenariosCompleted: number;
  org: string | null;
}

export type ScenarioState = "running" | "paused" | "faulted" | "queued";

export interface ActiveScenario {
  id: string;
  name: string;
  /** Which fictional estate it runs against. */
  org: string;
  operator: string;
  state: ScenarioState;
  /** Epoch ms when the run started. */
  startedAt: number;
  /** 0-100. Derived from the run, not a display string. */
  progressPct: number;
  /*
   * NO `openTickets` HERE.
   *
   * It used to be a number on the run, which made two sources for one fact:
   * the figure on the dashboard and the rows in the triage queue, free to
   * disagree the moment either was edited. The queue is the source now and
   * the counts come off it — see `openTicketsFor`.
   */
  /** Faults an admin has already injected into this run. */
  injectedFaults: string[];
}

export type ActivityKind =
  | "login"
  | "scenario-complete"
  | "scenario-start"
  | "ticket-raised"
  | "system-alert"
  | "subscription";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** Who or what. */
  actor: string;
  /** One line, already written as a sentence fragment. */
  summary: string;
  at: number;
  /** Only set for events that need attention. */
  severity?: "warning" | "critical";
}

export type SupportPriority = "P1" | "P2" | "P3";
export type SupportState = "new" | "triaged" | "in-progress" | "waiting" | "resolved";

/**
 * A support request raised by an operator mid-scenario.
 *
 * `runId` is what makes this a training ticket rather than a generic helpdesk
 * row: it links back to the run that produced it, so an instructor can see
 * which exercise is generating the confusion.
 */
export interface SupportTicket {
  id: string;
  subject: string;
  org: string;
  raisedBy: string;
  /** The run it came out of, or null when raised outside one. */
  runId: string | null;
  priority: SupportPriority;
  state: SupportState;
  assignee: string | null;
  raisedAt: number;
  /** SLA target. Breach is DERIVED by comparing with now, never stored. */
  dueAt: number;
}

export interface SubscriptionAccount {
  id: string;
  org: string;
  seats: number;
  seatsUsed: number;
  plan: "trial" | "pilot" | "enterprise";
  renewsAt: number;
  contact: string;
}

/**
 * Platform-wide configuration, as it would arrive from a settings endpoint.
 *
 * The credential is a PLACEHOLDER and is written to look like one: a masked
 * tail and an obviously fake prefix. Nothing on the settings screen accepts a
 * real secret, and nothing displays one — a panel that renders a live key is a
 * panel that leaks one over a shoulder.
 */
export interface PlatformSettings {
  defaultPack: string;
  /** Nothing below this tier is offered to a new cohort. */
  difficultyFloor: "Tier_1_Easy" | "Tier_2_Medium" | "Tier_3_Hard";
  /** Days of run history kept before it is purged. */
  retentionDays: number;
  exportFormat: "csv" | "json";
  allowSelfSignup: boolean;
  ssoProvider: "none" | "saml" | "oidc";
  ssoDomain: string;
  webhookUrl: string;
  /** Masked. The real value never reaches the browser. */
  apiKeyMasked: string;
  apiKeyRotatedAt: number;
}

/** A single sample in the resource series. */
export interface ResourceSample {
  /** Minutes ago, so the chart does not drift as the page sits open. */
  minutesAgo: number;
  cpuPct: number;
  memPct: number;
}

// ── Deterministic clock ─────────────────────────────────────────────────────
// Timestamps are relative to module load rather than hardcoded dates, so the
// feed never reads "3 days ago" because the fixture was written on a Tuesday.
const NOW = Date.now();
const mins = (n: number) => NOW - n * 60_000;
const hours = (n: number) => NOW - n * 3_600_000;
const days = (n: number) => NOW - n * 86_400_000;

export const ADMIN_USERS: AdminUser[] = [
  { id: "u-1041", name: "Jane Doe", email: "j.doe@sterlingtrust.example", role: "student", status: "active", lastSeen: mins(2), level: 7, scenariosCompleted: 23, org: "Sterling Trust" },
  { id: "u-1042", name: "Mateo Hansen", email: "m.hansen@sterlingtrust.example", role: "student", status: "active", lastSeen: mins(6), level: 4, scenariosCompleted: 11, org: "Sterling Trust" },
  { id: "u-1043", name: "Priya Villanueva", email: "p.villanueva@harborout.example", role: "instructor", status: "active", lastSeen: mins(14), level: 12, scenariosCompleted: 88, org: "Harbor Outfitters" },
  { id: "u-1044", name: "Tomas Berg", email: "t.berg@harborout.example", role: "student", status: "idle", lastSeen: hours(3), level: 2, scenariosCompleted: 3, org: "Harbor Outfitters" },
  { id: "u-1045", name: "Ava Andersen", email: "a.andersen@cedaroutfit.example", role: "student", status: "active", lastSeen: mins(21), level: 9, scenariosCompleted: 41, org: "Cedar Outfitters" },
  { id: "u-1046", name: "Samir Novotny", email: "s.novotny@cedaroutfit.example", role: "student", status: "suspended", lastSeen: days(6), level: 3, scenariosCompleted: 7, org: "Cedar Outfitters" },
  { id: "u-1047", name: "Maya Mbeki", email: "m.mbeki@summitsupply.example", role: "instructor", status: "idle", lastSeen: hours(9), level: 15, scenariosCompleted: 132, org: "Summit Supply" },
  { id: "u-0001", name: "Operator", email: "ops@itquest.example", role: "admin", status: "active", lastSeen: mins(0), level: 20, scenariosCompleted: 260, org: null },
];

export const ACTIVE_SCENARIOS: ActiveScenario[] = [
  { id: "run-8801", name: "Cascade — thermal to service outage", org: "Sterling Trust", operator: "Jane Doe", state: "running", startedAt: mins(38), progressPct: 62, injectedFaults: ["thermal-module"] },
  { id: "run-8802", name: "Ransomware containment drill", org: "Harbor Outfitters", operator: "Priya Villanueva", state: "running", startedAt: mins(12), progressPct: 18, injectedFaults: [] },
  { id: "run-8803", name: "PoE budget overload", org: "Cedar Outfitters", operator: "Ava Andersen", state: "faulted", startedAt: hours(2), progressPct: 74, injectedFaults: ["poe-overload", "rogue-dhcp"] },
  { id: "run-8804", name: "Rogue DHCP hunt", org: "Summit Supply", operator: "Maya Mbeki", state: "paused", startedAt: hours(1), progressPct: 45, injectedFaults: ["rogue-dhcp"] },
  { id: "run-8805", name: "Onboarding — first shift", org: "Sterling Trust", operator: "Mateo Hansen", state: "running", startedAt: mins(4), progressPct: 7, injectedFaults: [] },
  { id: "run-8806", name: "Backup tier restore under pressure", org: "Harbor Outfitters", operator: "Tomas Berg", state: "queued", startedAt: mins(1), progressPct: 0, injectedFaults: [] },
];

export const ACTIVITY_FEED: ActivityEvent[] = [
  { id: "a-1", kind: "system-alert", actor: "sim-node-03", summary: "memory pressure above 85% for 4 minutes", at: mins(1), severity: "warning" },
  { id: "a-2", kind: "login", actor: "Jane Doe", summary: "signed in from a new session", at: mins(2) },
  { id: "a-3", kind: "ticket-raised", actor: "Sterling Trust", summary: "raised TCK-4831 — mail relay rejecting outbound", at: mins(5) },
  { id: "a-4", kind: "scenario-start", actor: "Mateo Hansen", summary: "started Onboarding — first shift", at: mins(4) },
  { id: "a-5", kind: "system-alert", actor: "run-8803", summary: "scenario faulted — PoE budget exceeded on switch SW-2", at: mins(9), severity: "critical" },
  { id: "a-6", kind: "scenario-complete", actor: "Ava Andersen", summary: "completed Rogue DHCP hunt in 41 minutes", at: mins(23) },
  { id: "a-7", kind: "subscription", actor: "Harbor Outfitters", summary: "pilot extended by 30 days", at: hours(2) },
  { id: "a-8", kind: "login", actor: "Priya Villanueva", summary: "signed in", at: hours(3) },
  { id: "a-9", kind: "scenario-complete", actor: "Maya Mbeki", summary: "completed Backup tier restore under pressure", at: hours(5) },
  { id: "a-10", kind: "ticket-raised", actor: "Cedar Outfitters", summary: "raised TCK-4829 — account lockout loop", at: hours(6) },
];

/**
 * The triage queue.
 *
 * Written against the runs above, so an instructor reading the dashboard's
 * "open tickets" figure and an instructor reading this queue are looking at
 * the same twenty-one rows rather than two numbers that happen to agree today.
 */
export const PLATFORM_SETTINGS: PlatformSettings = {
  defaultPack: "Helpdesk Foundations",
  difficultyFloor: "Tier_1_Easy",
  retentionDays: 90,
  exportFormat: "csv",
  allowSelfSignup: false,
  ssoProvider: "saml",
  ssoDomain: "sterlingtrust.example",
  webhookUrl: "https://hooks.sterlingtrust.example/itquest",
  apiKeyMasked: "itq_demo_****************4f2a",
  apiKeyRotatedAt: days(46),
};

export const SCENARIO_PACKS = [
  "Helpdesk Foundations",
  "Network & Routing",
  "Security & Incident",
  "Hardware & Provisioning",
  "Cloud & Recovery",
];

export const SUPPORT_TICKETS: SupportTicket[] = [
  // run-8801 — Cascade, thermal to service outage
  { id: "TCK-4831", subject: "Mail relay rejecting outbound", org: "Sterling Trust", raisedBy: "Jane Doe", runId: "run-8801", priority: "P2", state: "in-progress", assignee: "L. Okonkwo", raisedAt: mins(5), dueAt: mins(-25) },
  { id: "TCK-4832", subject: "Rack 4B inlet reading 41 C", org: "Sterling Trust", raisedBy: "Jane Doe", runId: "run-8801", priority: "P1", state: "triaged", assignee: "L. Okonkwo", raisedAt: mins(14), dueAt: mins(-6) },
  { id: "TCK-4833", subject: "Cannot reach FS-01 after failover", org: "Sterling Trust", raisedBy: "Jane Doe", runId: "run-8801", priority: "P2", state: "new", assignee: null, raisedAt: mins(19), dueAt: mins(-11) },
  { id: "TCK-4834", subject: "Which node owns the cooling alarm?", org: "Sterling Trust", raisedBy: "Jane Doe", runId: "run-8801", priority: "P3", state: "waiting", assignee: "R. Silva", raisedAt: mins(31), dueAt: hours(-3) },

  // run-8802 — Ransomware containment drill
  { id: "TCK-4835", subject: "Shares encrypted on HR volume", org: "Harbor Outfitters", raisedBy: "Priya Villanueva", runId: "run-8802", priority: "P1", state: "in-progress", assignee: "R. Silva", raisedAt: mins(8), dueAt: mins(-22) },
  { id: "TCK-4836", subject: "Containment rule blocks legitimate traffic", org: "Harbor Outfitters", raisedBy: "Priya Villanueva", runId: "run-8802", priority: "P2", state: "triaged", assignee: "R. Silva", raisedAt: mins(10), dueAt: mins(-20) },
  { id: "TCK-4837", subject: "Backup job failed mid-restore", org: "Harbor Outfitters", raisedBy: "Tomas Berg", runId: "run-8802", priority: "P1", state: "new", assignee: null, raisedAt: mins(11), dueAt: mins(-19) },
  { id: "TCK-4838", subject: "Cannot isolate the infected subnet", org: "Harbor Outfitters", raisedBy: "Priya Villanueva", runId: "run-8802", priority: "P2", state: "new", assignee: null, raisedAt: mins(12), dueAt: mins(-18) },
  { id: "TCK-4839", subject: "Where is the ransomware playbook?", org: "Harbor Outfitters", raisedBy: "Priya Villanueva", runId: "run-8802", priority: "P3", state: "waiting", assignee: "L. Okonkwo", raisedAt: mins(12), dueAt: hours(-4) },

  // run-8803 — PoE budget overload (faulted)
  { id: "TCK-4829", subject: "Account lockout loop", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P2", state: "in-progress", assignee: "L. Okonkwo", raisedAt: hours(6), dueAt: hours(3) },
  { id: "TCK-4840", subject: "Cameras dropping off SW-2", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P1", state: "triaged", assignee: "R. Silva", raisedAt: mins(9), dueAt: mins(-21) },
  { id: "TCK-4841", subject: "PoE budget exceeded — which ports do I drop?", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P2", state: "new", assignee: null, raisedAt: mins(13), dueAt: mins(-17) },
  { id: "TCK-4842", subject: "NVR shows eight cameras, switch shows ten", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P3", state: "new", assignee: null, raisedAt: mins(26), dueAt: hours(-3) },
  { id: "TCK-4843", subject: "Rogue lease server still handing out addresses", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P1", state: "waiting", assignee: "R. Silva", raisedAt: mins(41), dueAt: mins(-11) },
  { id: "TCK-4844", subject: "Run faulted — can I resume from the last step?", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: "run-8803", priority: "P3", state: "new", assignee: null, raisedAt: mins(7), dueAt: hours(-4) },

  // run-8804 — Rogue DHCP hunt (paused)
  { id: "TCK-4845", subject: "Two DHCP servers answering on the same VLAN", org: "Summit Supply", raisedBy: "Maya Mbeki", runId: "run-8804", priority: "P2", state: "triaged", assignee: "L. Okonkwo", raisedAt: mins(45), dueAt: mins(-15) },
  { id: "TCK-4846", subject: "Lease table empty after the scope change", org: "Summit Supply", raisedBy: "Maya Mbeki", runId: "run-8804", priority: "P3", state: "waiting", assignee: null, raisedAt: hours(1), dueAt: hours(-2) },

  // run-8805 — Onboarding
  { id: "TCK-4847", subject: "How do I claim a ticket from the queue?", org: "Sterling Trust", raisedBy: "Mateo Hansen", runId: "run-8805", priority: "P3", state: "new", assignee: null, raisedAt: mins(3), dueAt: hours(-4) },

  // Raised outside a run — the platform itself, not an exercise.
  { id: "TCK-4848", subject: "SSO redirect loops on first sign-in", org: "Summit Supply", raisedBy: "M. Mbeki", runId: null, priority: "P1", state: "in-progress", assignee: "R. Silva", raisedAt: hours(2), dueAt: mins(-40) },
  { id: "TCK-4849", subject: "Seat count wrong after adding five students", org: "Harbor Outfitters", raisedBy: "P. Villanueva", runId: null, priority: "P2", state: "triaged", assignee: "L. Okonkwo", raisedAt: hours(4), dueAt: hours(-1) },
  { id: "TCK-4850", subject: "Export of last term's results is empty", org: "Sterling Trust", raisedBy: "IT Training", runId: null, priority: "P3", state: "new", assignee: null, raisedAt: hours(7), dueAt: hours(-12) },

  // Closed, so the queue has somewhere to have come from.
  { id: "TCK-4820", subject: "Cannot start a scenario — spinner forever", org: "Cedar Outfitters", raisedBy: "Ava Andersen", runId: null, priority: "P2", state: "resolved", assignee: "R. Silva", raisedAt: days(1), dueAt: hours(18) },
  { id: "TCK-4821", subject: "Wrong org shown on the profile card", org: "Summit Supply", raisedBy: "Maya Mbeki", runId: null, priority: "P3", state: "resolved", assignee: "L. Okonkwo", raisedAt: days(2), dueAt: days(1) },
  { id: "TCK-4822", subject: "Instructor cannot see student progress", org: "Sterling Trust", raisedBy: "IT Training", runId: null, priority: "P2", state: "resolved", assignee: "R. Silva", raisedAt: days(3), dueAt: days(2) },
];

/** Who a ticket can be assigned to. Mock support rota. */
export const SUPPORT_ROTA = ["L. Okonkwo", "R. Silva", "T. Nakamura"];

export const SUBSCRIPTIONS: SubscriptionAccount[] = [
  { id: "sub-01", org: "Sterling Trust", seats: 40, seatsUsed: 31, plan: "enterprise", renewsAt: days(-58), contact: "it-training@sterlingtrust.example" },
  { id: "sub-02", org: "Harbor Outfitters", seats: 15, seatsUsed: 15, plan: "pilot", renewsAt: days(-12), contact: "p.villanueva@harborout.example" },
  { id: "sub-03", org: "Cedar Outfitters", seats: 10, seatsUsed: 4, plan: "trial", renewsAt: days(-3), contact: "ops@cedaroutfit.example" },
  { id: "sub-04", org: "Summit Supply", seats: 25, seatsUsed: 19, plan: "enterprise", renewsAt: days(-121), contact: "m.mbeki@summitsupply.example" },
];

/**
 * Forty minutes of resource samples, newest last.
 *
 * Hand-shaped rather than random: there is a visible ramp and a spike that
 * lines up with the "memory pressure" alert in the feed. A chart of noise
 * proves the chart renders; a chart that agrees with the rest of the page
 * proves the page is telling one story.
 */
export const RESOURCE_SERIES: ResourceSample[] = [
  { minutesAgo: 40, cpuPct: 31, memPct: 48 },
  { minutesAgo: 37, cpuPct: 34, memPct: 49 },
  { minutesAgo: 34, cpuPct: 29, memPct: 51 },
  { minutesAgo: 31, cpuPct: 38, memPct: 53 },
  { minutesAgo: 28, cpuPct: 44, memPct: 56 },
  { minutesAgo: 25, cpuPct: 41, memPct: 58 },
  { minutesAgo: 22, cpuPct: 52, memPct: 62 },
  { minutesAgo: 19, cpuPct: 58, memPct: 66 },
  { minutesAgo: 16, cpuPct: 63, memPct: 71 },
  { minutesAgo: 13, cpuPct: 57, memPct: 74 },
  { minutesAgo: 10, cpuPct: 66, memPct: 79 },
  { minutesAgo: 7, cpuPct: 72, memPct: 84 },
  { minutesAgo: 4, cpuPct: 69, memPct: 87 },
  { minutesAgo: 1, cpuPct: 74, memPct: 86 },
];

// ── Derived summaries ───────────────────────────────────────────────────────
// Computed from the fixtures above rather than written as separate constants,
// so a change to the user list cannot leave the KPI card disagreeing with the
// table underneath it. That disagreement is the classic mock-data bug, and it
// survives into production as two endpoints that never quite match.

export const totalUsers = () => ADMIN_USERS.length;
export const activeUsers = () => ADMIN_USERS.filter((u) => u.status === "active").length;
export const runningScenarios = () => ACTIVE_SCENARIOS.filter((s) => s.state === "running").length;
export const faultedScenarios = () => ACTIVE_SCENARIOS.filter((s) => s.state === "faulted").length;
/** Anything not resolved is open. One definition, used everywhere. */
export const isOpen = (t: SupportTicket) => t.state !== "resolved";
export const openTickets = () => SUPPORT_TICKETS.filter(isOpen).length;
/** Open tickets belonging to one run — what the simulator table shows. */
export const openTicketsFor = (runId: string) =>
  SUPPORT_TICKETS.filter((t) => t.runId === runId && isOpen(t)).length;
/** Past its SLA target and still open. Derived against the clock, never stored. */
export const isBreached = (t: SupportTicket, now = Date.now()) => isOpen(t) && t.dueAt < now;
export const breachedTickets = () => SUPPORT_TICKETS.filter((t) => isBreached(t)).length;
export const seatsUsed = () => SUBSCRIPTIONS.reduce((n, s) => n + s.seatsUsed, 0);
export const seatsTotal = () => SUBSCRIPTIONS.reduce((n, s) => n + s.seats, 0);

/** Worst-case resource pressure, which is what a health badge should report. */
export function systemHealth(): { label: string; tone: "ok" | "warn" | "bad"; detail: string } {
  const latest = RESOURCE_SERIES[RESOURCE_SERIES.length - 1];
  const worst = Math.max(latest.cpuPct, latest.memPct);
  if (worst >= 85) return { label: "Degraded", tone: "bad", detail: `memory at ${latest.memPct}%` };
  if (worst >= 70) return { label: "Under load", tone: "warn", detail: `cpu at ${latest.cpuPct}%` };
  return { label: "Healthy", tone: "ok", detail: "all nodes nominal" };
}

// ── Formatting helpers ──────────────────────────────────────────────────────
// Here rather than duplicated in four components, but deliberately NOT baked
// into the fixtures: they operate on the API-shaped values above.

export function relativeTime(at: number, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 45) return "just now";
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Renewal dates are in the future, so they read forwards. */
/**
 * A date in days, in whichever direction it actually lies.
 *
 * The subtraction used to run `now - at`, the PAST direction, in a function
 * whose whole job is to describe a renewal that has not happened yet: every
 * future date came out negative, hit the `<= 0` branch and rendered "today".
 * Four accounts renewing across four months all read the same.
 *
 * It answers both directions now, because a "last rotated" date and a "renews"
 * date are the same question asked either side of the present.
 */
export function inDays(at: number, now = Date.now()): string {
  const d = Math.round((at - now) / 86_400_000);
  if (d === 0) return "today";
  if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
  const ago = -d;
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}
