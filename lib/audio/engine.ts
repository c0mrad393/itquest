"use client";

/**
 * TriageOS — System audio engine
 * ==============================
 * Every UI sound is SYNTHESISED at play time with the Web Audio API. Nothing is
 * fetched and nothing is bundled: a cue is a few oscillators, an envelope and a
 * filter, which costs less than a single sprite would and stays crisp at any
 * sample rate.
 *
 * House style — sleek and quiet, never arcade:
 *   • sine and triangle only; no saw, no square except a heavily filtered error
 *   • every cue under 400ms, most under 150ms
 *   • master gain sits low (0.35) and a lowpass shelves the top end so the
 *     cues sit under speech and never sting on headphones
 *
 * Autoplay policy: an AudioContext starts suspended until the page has seen a
 * gesture. We create it lazily on the first cue and also arm a one-shot
 * unlock listener, so the very first sound after load is not swallowed.
 */

export type SoundCue =
  | "open" // window/app opened
  | "close" // window closed
  | "minimize" // window minimized
  | "notify" // toast slide-in
  | "success" // ticket resolved
  | "error"; // CLI / config validation rejected

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlockArmed = false;

/** The store mirrors the persisted preference into here on boot and on change. */
export function setAudioEnabled(on: boolean): void {
  enabled = on;
}

export function isAudioEnabled(): boolean {
  return enabled;
}

function armUnlock(): void {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const resume = () => {
    void ctx?.resume();
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("keydown", resume);
  };
  window.addEventListener("pointerdown", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
}

function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    // Master chain: gain → gentle lowpass. Keeps the cues soft on headphones.
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    lp.Q.value = 0.7;
    gain.connect(lp).connect(ctx.destination);
    master = gain;

    armUnlock();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { ctx, master } : null;
}

interface ToneSpec {
  freq: number;
  /** Glide to this frequency across the note — the "UI blip" character. */
  slideTo?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds to wait before this tone starts (for arpeggios). */
  delay?: number;
}

function tone({ freq, slideTo, dur, type = "sine", gain = 1, delay = 0 }: ToneSpec): void {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;

  const osc = a.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

  // Percussive envelope: fast attack, exponential tail. Ramping to a tiny
  // value rather than 0 avoids the click a hard stop produces.
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env).connect(a.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Cue definitions. Kept together so the palette stays coherent. */
const CUES: Record<SoundCue, () => void> = {
  // Soft rising blip — something arrived on screen.
  open: () => tone({ freq: 440, slideTo: 660, dur: 0.09, gain: 0.5 }),
  // Mirror of `open`, falling.
  close: () => tone({ freq: 560, slideTo: 380, dur: 0.09, gain: 0.4 }),
  minimize: () => tone({ freq: 520, slideTo: 300, dur: 0.08, gain: 0.32 }),

  // Two-tone chime, a clean fifth apart. Discreet but cuts through.
  notify: () => {
    tone({ freq: 880, dur: 0.13, gain: 0.42 });
    tone({ freq: 1318.5, dur: 0.22, gain: 0.3, delay: 0.075 });
  },

  // Major triad arpeggio (C5-E5-G5) — the reward cue, paired with the XP toast.
  success: () => {
    tone({ freq: 523.25, dur: 0.16, gain: 0.4 });
    tone({ freq: 659.25, dur: 0.16, gain: 0.36, delay: 0.07 });
    tone({ freq: 783.99, dur: 0.32, gain: 0.34, delay: 0.14 });
  },

  // Low muted triangle with a slight downward bend. Reads as "rejected"
  // without being a buzzer.
  error: () => {
    tone({ freq: 196, slideTo: 155, dur: 0.16, type: "triangle", gain: 0.42 });
    tone({ freq: 98, dur: 0.2, type: "sine", gain: 0.26, delay: 0.02 });
  },
};

/** Play a cue. No-op when muted, pre-gesture, or on a browser without WebAudio. */
export function playCue(cue: SoundCue): void {
  if (!enabled) return;
  try {
    CUES[cue]();
  } catch {
    // Audio is decoration — never let it break an interaction.
  }
}
