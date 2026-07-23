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

/** Preset avatars offered in the Profile app (plus Google photo / custom URL). */
export const AVATAR_PRESETS: string[] = [
  "🧑‍💻", "👩🏽‍💼", "👨🏻‍🔧", "🕵️", "🧙", "🤖", "🦉", "🐺", "🛡️", "⚡",
];

export function isImageAvatar(avatar: string): boolean {
  return /^https?:\/\//.test(avatar);
}
