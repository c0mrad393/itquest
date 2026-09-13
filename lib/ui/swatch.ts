/**
 * ITQuest — What a colour class ACTUALLY renders as (pure)
 * ========================================================
 * Resolves a Tailwind colour utility to the token identity behind it, so two
 * classes that look different in source but paint the same pixels can be told
 * apart by a specification.
 *
 * ── WHY THIS HAD TO EXIST ───────────────────────────────────────────────────
 *
 * `tailwind.config.ts` remaps every raw Tailwind family onto a semantic one —
 * a good decision, and the thing that gives the product correct light-mode
 * contrast without a per-component sweep. But it has a consequence nobody was
 * checking: `amber` and `orange` are the SAME family, and so are `sky`,
 * `blue`, `cyan` and `indigo`.
 *
 * So a map that assigned `text-amber-300` to Medium severity and
 * `text-orange-300` to High was assigning ONE colour to two levels. Measured
 * in the browser, both rendered `rgb(252, 200, 110)`. Ticket status was worse:
 * New, Accepted and In Progress — the three states a ticket passes THROUGH
 * while being worked — all rendered `rgb(130, 183, 255)`.
 *
 * Reviewing the source could never catch it, because the names differ. The
 * only durable defence is to resolve the names and compare what comes out,
 * which is what this file is for.
 */

/** Raw Tailwind family name → the semantic family it is remapped onto. */
const FAMILY: Record<string, string> = {
  emerald: "accent", green: "accent", teal: "accent", lime: "accent",
  amber: "warn", yellow: "warn", orange: "warn",
  red: "danger", rose: "danger", pink: "danger",
  sky: "info", blue: "info", cyan: "info", indigo: "info",
  violet: "violet", purple: "violet", fuchsia: "violet",
  gray: "neutral", slate: "neutral", zinc: "neutral", stone: "neutral", neutral: "neutral",
  // Families addressed by their semantic name already.
  accent: "accent", warn: "warn", danger: "danger", info: "info", brand: "brand",
};

/**
 * Shade → role. `family()` in the Tailwind config collapses the 50–950 scale
 * onto three tokens, so 300 and 200 are the same ink and 300 and 500 are not.
 *
 * The neutral ramp is the exception: it keeps a real per-shade scale, so its
 * shade is carried through untouched.
 */
function role(family: string, shade: number): string {
  if (family === "neutral") return String(shade);
  if (shade <= 300) return "text";
  if (shade <= 600) return "base";
  return "deep";
}

/**
 * The token identity of one utility, or null if it is not a colour.
 *
 * Opacity is part of the identity: `bg-amber-500/15` and `bg-amber-500/30` are
 * the same ink at different strengths and DO look different, which is a
 * legitimate way to separate two entries in a map.
 */
export function swatchOf(util: string): string | null {
  const m = /^(?:(hover|focus|active):)?(text|bg|border|fill|stroke|ring|from|to|via)-([a-z]+)-(\d{2,3})(?:\/(\d+))?$/.exec(util);
  if (!m) {
    // Semantic aliases carry no shade: `bg-danger`, `text-warn-strong`.
    const s = /^(?:(hover|focus|active):)?(text|bg|border|fill|stroke|ring)-(brand|info|accent|warn|danger|violet|edge|surface|panel|sunken)(-[a-z]+)?(?:\/(\d+))?$/.exec(util);
    if (!s) return null;
    return `${s[2]}:${s[3]}${s[4] ?? ""}${s[5] ? `/${s[5]}` : ""}`;
  }
  const [, , prop, raw, shade, alpha] = m;
  const fam = FAMILY[raw];
  if (!fam) return null;
  return `${prop}:${fam}:${role(fam, Number(shade))}${alpha ? `/${alpha}` : ""}`;
}

/**
 * Everything about a class string that decides how it paints.
 *
 * Colour utilities are resolved; anything else that changes appearance —
 * weight, border presence — is kept verbatim, because those are also
 * legitimate ways to tell two entries apart. Sorted, so the order the author
 * happened to write the classes in is not part of the answer.
 */
export function renderIdentity(classes: string): string {
  return classes
    .split(/\s+/)
    .filter(Boolean)
    .map((u) => swatchOf(u) ?? (/^(font-|border$|ring-|uppercase|italic|underline|opacity-)/.test(u) ? u : null))
    .filter((x): x is string => x !== null)
    .sort()
    .join(" ");
}

/**
 * Which entries of a map would paint identically.
 *
 * Returns the colliding groups, so a failure names the keys rather than just
 * counting them.
 */
export function collisions(entries: Record<string, string>): string[][] {
  const byIdentity = new Map<string, string[]>();
  for (const [key, classes] of Object.entries(entries)) {
    const id = renderIdentity(classes);
    byIdentity.set(id, [...(byIdentity.get(id) ?? []), key]);
  }
  return [...byIdentity.values()].filter((keys) => keys.length > 1);
}
