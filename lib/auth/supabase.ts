/**
 * TriageOS — Supabase client (Entry/Identity layer)
 * =================================================
 * Browser-side singleton. Configuration comes from env:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
 *
 * When unset, `isSupabaseConfigured` is false and the auth layer degrades to
 * a local Guest session — the sim stays fully usable, and real auth activates
 * with zero code changes once the env vars (and supabase/schema.sql) are in
 * place.
 */

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured: boolean = url.length > 0 && anonKey.length > 0;

let client: SupabaseClient | null = null;

/** Lazily-created singleton. Only call when `isSupabaseConfigured` is true. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // PKCE + URL detection make the Google OAuth redirect land cleanly
        // on /desktop with no server-side callback route.
        flowType: "pkce",
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
