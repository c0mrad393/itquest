/**
 * TriageOS — Seeded RNG (procedural generation core)
 * ==================================================
 * mulberry32: tiny, fast, deterministic. Every OrgGenerator run is a pure
 * function of its seed, so a user's world can be regenerated bit-identically
 * from the persisted seed.
 */

export type Rng = () => number; // [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export const chance = (rng: Rng, p: number): boolean => rng() < p;

/** Fisher–Yates shuffle (non-mutating). */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick n distinct items. */
export const sample = <T>(rng: Rng, arr: readonly T[], n: number): T[] =>
  shuffle(rng, arr).slice(0, Math.min(n, arr.length));

/** Fresh random seed (for brand-new worlds). */
export const freshSeed = (): number => Math.floor(Math.random() * 0xffffffff);
