/**
 * TriageOS — Identity & profile types (Entry/Identity layer)
 * ==========================================================
 * The authenticated operator. `UserProfile` mirrors the Supabase `profiles`
 * row (see supabase/schema.sql) and is the persistent, cross-device identity;
 * the in-sim `HostUser` (display name / avatar / xp) is hydrated FROM it on
 * sign-in and synced back on progression changes.
 */

export type AuthProvider = "password" | "google" | "guest";

export type AuthStatus =
  | "loading" // boot: resolving the existing session
  | "signedOut"
  | "guest" // local-only session (Supabase not configured or user chose guest)
  | "signedIn";

/** Mirrors public.profiles — one row per auth.users entry. */
export interface UserProfile {
  /** auth.users id (uuid). "guest" for local guest sessions. */
  id: string;
  email: string | null;
  /** Display username, editable in the Profile app. */
  username: string;
  /**
   * Avatar: either an emoji (rendered as text) or an https URL
   * (e.g. the Google account photo, or a custom image URL).
   */
  avatar: string;
  provider: AuthProvider;
  /** Persistent progression (synced from the sim on resolution). */
  xp: number;
  level: number;
  createdAt: number; // epoch millis
}

export function isImageAvatar(avatar: string): boolean {
  return /^https?:\/\//.test(avatar);
}

// ── Generated initial avatars ───────────────────────────────────────────────
// Avatars are drawn, not picked from a glyph set: a monogram on a two-stop
// gradient. `avatar` holds a palette id; anything unrecognised (including the
// emoji stored by pre-v0.1.7 saves) falls back to a palette hashed from the
// name, so every operator still gets a stable, distinct colour.

export interface AvatarPalette {
  id: string;
  label: string;
  from: string;
  to: string;
  /** Monogram colour — always the accessible choice against `from`/`to`. */
  fg: string;
}

export const AVATAR_PALETTES: AvatarPalette[] = [
  { id: "indigo", label: "Indigo", from: "#4f6bed", to: "#8b5cf6", fg: "#ffffff" },
  { id: "teal", label: "Teal", from: "#0d9488", to: "#22d3ee", fg: "#04211f" },
  { id: "amber", label: "Amber", from: "#d97706", to: "#fbbf24", fg: "#2a1601" },
  { id: "rose", label: "Rose", from: "#be123c", to: "#fb7185", fg: "#ffffff" },
  { id: "emerald", label: "Emerald", from: "#047857", to: "#34d399", fg: "#04231a" },
  { id: "slate", label: "Slate", from: "#334155", to: "#94a3b8", fg: "#ffffff" },
  { id: "violet", label: "Violet", from: "#6d28d9", to: "#c084fc", fg: "#ffffff" },
  { id: "sky", label: "Sky", from: "#0369a1", to: "#38bdf8", fg: "#02202f" },
  { id: "crimson", label: "Crimson", from: "#9f1239", to: "#f43f5e", fg: "#ffffff" },
  { id: "lime", label: "Lime", from: "#4d7c0f", to: "#a3e635", fg: "#1a2405" },
];

/** Stable string hash — same name always lands on the same palette. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function paletteFor(avatar: string, name: string): AvatarPalette {
  const named = AVATAR_PALETTES.find((p) => p.id === avatar);
  return named ?? AVATAR_PALETTES[hash(name || avatar) % AVATAR_PALETTES.length];
}

/** Up to two initials: "Jane Doe" → JD, "QA Tester" → QT, "j.doe" → JD. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
