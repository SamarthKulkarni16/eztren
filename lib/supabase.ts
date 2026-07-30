import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// Session lives in a cookie (not localStorage). Browsers evict localStorage
// after days of inactivity as a privacy measure (Safari ITP ~7 days, and
// Chrome/Edge are rolling out similar unused-site-data clearing) — that was
// silently logging users out even though the Supabase refresh token itself
// never expired. Cookies aren't subject to that eviction.
//
// maxAge is capped at 400 days by Chrome/Safari/Firefox regardless of what
// we set — there's no way to make a cookie live forever. But every time this
// client writes a fresh session (sign-in, or the ~hourly auto token refresh
// while the user is active), it re-issues the cookie with maxAge reset from
// that moment. So in practice: any user who opens the site at least once a
// year never gets logged out. Only clearing site data/cookies logs them out.
export const supabase = isSupabaseConfigured
  ? createBrowserClient(url as string, key as string, {
      db: { schema: "eztren" },
      cookieOptions: {
        name: "sb-eztren-auth",
        maxAge: 60 * 60 * 24 * 400, // 400 days — the browser-enforced ceiling
        sameSite: "lax",
        secure: true,
        path: "/",
      },
    })
  : null;
