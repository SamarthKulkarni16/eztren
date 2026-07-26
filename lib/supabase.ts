import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// When env vars aren't set yet (e.g. before you've created the Supabase
// project), this client is never actually called — see lib/queries.ts,
// which falls back to the seed data in lib/data.ts instead.
export const supabase = isSupabaseConfigured
  ? createClient(url as string, key as string, {
      db: { schema: "eztren" },
    })
  : null;
