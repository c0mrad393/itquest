/**
 * TriageOS — Centralized Fleet Policies (v0.8.0)
 * ==============================================
 * The Group Policy analogue, with the part that actually teaches something:
 * RESOLUTION. Anyone can attach a setting to a container. The skill worth
 * simulating is working out which of four policies is the one that won, and
 * why the one you just edited did nothing.
 *
 * THE RULES, in the order they are applied — these are the real ones, and
 * getting them wrong in a simulator would teach the opposite of the truth:
 *
 *   1. SCOPE.  A policy applies to a target if it is linked to the domain
 *              root, or to an OU on the target's path from the root down.
 *   2. ORDER.  Closest container wins. An OU link beats a domain link,
 *              because it is applied later and overwrites.
 *   3. BLOCK.  An OU may block inheritance, which drops everything from its
 *              ancestors — the classic reason a domain-wide setting is
 *              mysteriously absent on one team.
 *   4. ENFORCE. An enforced link is immune to blocking AND flips the order:
 *              it beats anything closer to the target. This is the override
 *              of last resort, and the reason "but I set it on the OU" is
 *              sometimes wrong.
 *
 * `resolveSetting` returns the winning value AND the policy that supplied it,
 * because a ticket must be able to grade the LINK the operator made rather
 * than a value that might have arrived from somewhere else entirely.
 *
 * All pure. The console and the ticket win-conditions call the same functions.
 */

// ── Settings ────────────────────────────────────────────────────────────────

export type PolicyValue = string | number | boolean;

/**
 * The settings a Fleet Policy can carry. A closed catalogue rather than free
 * text: a policy engine whose keys are typos is not a teaching tool, and the
 * tickets need something stable to grade.
 */
export type PolicyKey =
  | "passwordMinLength"
  | "passwordComplexity"
  | "passwordMaxAgeDays"
  | "lockoutThreshold"
  | "lockoutDurationMins"
  | "usbStorageBlocked"
  | "screenLockMins"
  | "mappedDrive"
  | "firewallEnabled"
  | "softwareInstallBlocked";

export interface PolicyKeyMeta {
  key: PolicyKey;
  label: string;
  category: "Account" | "Security" | "Desktop" | "Drives";
  kind: "number" | "boolean" | "text";
  /** What this does, in the words the wiki uses. */
  hint: string;
  /** Sensible starting value when the operator adds the setting. */
  fallback: PolicyValue;
}

export const POLICY_KEYS: PolicyKeyMeta[] = [
  { key: "passwordMinLength", label: "Minimum password length", category: "Account", kind: "number", fallback: 12,
    hint: "Characters required. Longer beats complex — a 16-character passphrase outlives a 8-character puzzle." },
  { key: "passwordComplexity", label: "Require complexity", category: "Account", kind: "boolean", fallback: true,
    hint: "Mixed case, digits and symbols. Widely mandated; on its own it mostly produces Password1!" },
  { key: "passwordMaxAgeDays", label: "Maximum password age (days)", category: "Account", kind: "number", fallback: 90,
    hint: "How long before a forced change. Zero means never expires." },
  { key: "lockoutThreshold", label: "Lockout threshold", category: "Account", kind: "number", fallback: 5,
    hint: "Failed sign-ins before the account locks. Too low and you become the unlock service desk." },
  { key: "lockoutDurationMins", label: "Lockout duration (minutes)", category: "Account", kind: "number", fallback: 15,
    hint: "How long a locked account stays locked without an administrator." },
  { key: "usbStorageBlocked", label: "Block USB mass storage", category: "Security", kind: "boolean", fallback: true,
    hint: "Stops removable drives mounting. The standard control for teams handling regulated data." },
  { key: "screenLockMins", label: "Screen lock after (minutes)", category: "Desktop", kind: "number", fallback: 10,
    hint: "Idle time before the workstation locks itself." },
  { key: "mappedDrive", label: "Mapped network drive", category: "Drives", kind: "text", fallback: "",
    hint: "A UNC path mounted at sign-in, e.g. \\\\fs01\\Finance_Share." },
  { key: "firewallEnabled", label: "Endpoint firewall", category: "Security", kind: "boolean", fallback: true,
    hint: "The host firewall on staff machines." },
  { key: "softwareInstallBlocked", label: "Block software installation", category: "Security", kind: "boolean", fallback: false,
    hint: "Prevents staff installing applications themselves." },
];

export function policyKeyMeta(key: PolicyKey): PolicyKeyMeta {
  return POLICY_KEYS.find((k) => k.key === key) ?? POLICY_KEYS[0];
}

// ── Policy objects ──────────────────────────────────────────────────────────

/** Where a policy is attached. The domain root is the whole estate. */
export interface PolicyLink {
  /** OU distinguished name, or `DOMAIN_ROOT` for the domain-wide link. */
  target: string;
  /** An enforced link survives blocked inheritance and beats closer links. */
  enforced: boolean;
  /** A disabled link stays visible in the console but stops applying. */
  enabled: boolean;
}

export const DOMAIN_ROOT = "@domain";

export interface FleetPolicy {
  id: string;
  name: string;
  description: string;
  /** Whether the policy object itself is switched on at all. */
  enabled: boolean;
  settings: Partial<Record<PolicyKey, PolicyValue>>;
  links: PolicyLink[];
  /** Millis — shown in the console so a tester can see what changed last. */
  updatedAt: number;
}

export interface PolicyState {
  policies: FleetPolicy[];
  /** OU distinguished names that block inherited policies. */
  blockedOus: string[];
}

export function createPolicyState(): PolicyState {
  return { policies: [], blockedOus: [] };
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * The containers a target sits inside, ordered root-first.
 *
 * OU distinguished names nest right-to-left (`OU=Payroll,OU=Finance,DC=…`), so
 * walking the ancestry means peeling OU components off the front.
 */
export function ouChain(ouDn: string): string[] {
  const parts = ouDn.split(",");
  const ouParts = parts.filter((p) => p.trim().toUpperCase().startsWith("OU="));
  const tail = parts.filter((p) => !p.trim().toUpperCase().startsWith("OU=")).join(",");
  const chain: string[] = [];
  // Outermost OU first: the last OU component is nearest the domain root.
  for (let i = ouParts.length - 1; i >= 0; i--) {
    chain.push([...ouParts.slice(i), tail].filter(Boolean).join(","));
  }
  return chain;
}

/** Every container a target is affected by, domain root first. */
export function scopeChain(ouDn: string): string[] {
  return [DOMAIN_ROOT, ...ouChain(ouDn)];
}

export interface AppliedSetting {
  key: PolicyKey;
  value: PolicyValue;
  /** The policy that supplied the winning value. */
  policyId: string;
  policyName: string;
  /** Where that policy is linked. */
  target: string;
  enforced: boolean;
}

/**
 * Every setting in force on a target OU, and which policy won each one.
 *
 * The walk is deliberately literal about precedence so the console can explain
 * itself: unenforced links are applied root-outward (closer overwrites), then
 * enforced links are applied root-outward on top (higher wins, and nothing
 * closer can take it back).
 */
export function resolvePolicies(state: PolicyState, ouDn: string): Map<PolicyKey, AppliedSetting> {
  const chain = scopeChain(ouDn);
  const blocked = new Set(state.blockedOus);

  // Blocking drops inherited links — everything from a container ABOVE the
  // highest blocking OU on this path. Enforced links ignore that entirely.
  let firstApplicable = 0;
  for (let i = 0; i < chain.length; i++) {
    if (i > 0 && blocked.has(chain[i])) firstApplicable = i;
  }

  const out = new Map<PolicyKey, AppliedSetting>();

  const apply = (pass: "normal" | "enforced") => {
    chain.forEach((container, depth) => {
      if (pass === "normal" && depth < firstApplicable) return;
      for (const policy of state.policies) {
        if (!policy.enabled) continue;
        for (const link of policy.links) {
          if (link.target !== container || !link.enabled) continue;
          if (pass === "normal" ? link.enforced : !link.enforced) continue;
          for (const [key, value] of Object.entries(policy.settings) as [PolicyKey, PolicyValue][]) {
            if (value === undefined) continue;
            const existing = out.get(key);
            // In the enforced pass, an entry already set by a HIGHER enforced
            // link must survive: enforcement wins from the top down.
            if (pass === "enforced" && existing?.enforced) continue;
            out.set(key, {
              key,
              value,
              policyId: policy.id,
              policyName: policy.name,
              target: container,
              enforced: link.enforced,
            });
          }
        }
      }
    });
  };

  apply("normal");
  apply("enforced");
  return out;
}

/** The winning value for one setting, or null when nothing sets it. */
export function resolveSetting(
  state: PolicyState,
  ouDn: string,
  key: PolicyKey,
): AppliedSetting | null {
  return resolvePolicies(state, ouDn).get(key) ?? null;
}

/**
 * Is this setting in force on this OU with this value?
 *
 * What the tickets grade with: it does not care HOW the operator got there —
 * a new policy, an existing one, a domain link or an OU link — only that the
 * fleet actually ends up configured the way the request asked.
 */
export function settingApplies(
  state: PolicyState,
  ouDn: string,
  key: PolicyKey,
  value: PolicyValue,
): boolean {
  return resolveSetting(state, ouDn, key)?.value === value;
}

/** Policies linked directly to a container, for the console's tree. */
export function linksFor(state: PolicyState, target: string): FleetPolicy[] {
  return state.policies.filter((p) => p.links.some((l) => l.target === target));
}

/**
 * Why a policy the operator expected is not in force — the console's
 * "explain" line, and the single most useful thing a policy tool can say.
 */
export function explainAbsence(
  state: PolicyState,
  ouDn: string,
  key: PolicyKey,
): string | null {
  const winner = resolveSetting(state, ouDn, key);
  const setters = state.policies.filter((p) => p.settings[key] !== undefined);

  if (!setters.length) return `No Fleet Policy sets ${policyKeyMeta(key).label.toLowerCase()} anywhere.`;
  if (!winner) {
    const linked = setters.filter((p) => p.links.length > 0);
    if (!linked.length) {
      return `${setters[0].name} sets it, but the policy is not linked to anything. Link it to a container.`;
    }
    const chain = new Set(scopeChain(ouDn));
    const onPath = linked.some((p) => p.links.some((l) => chain.has(l.target)));
    if (!onPath) return `${linked[0].name} is linked, but not anywhere on this container's path.`;
    if (state.blockedOus.some((b) => scopeChain(ouDn).includes(b))) {
      return `An organizational unit on this path blocks inheritance, so the link above it is dropped. Enforce the link, or stop blocking.`;
    }
    if (linked.every((p) => !p.enabled)) return `${linked[0].name} is linked here but the policy object is disabled.`;
    return `${linked[0].name} is linked here but its link is disabled.`;
  }
  return null;
}
