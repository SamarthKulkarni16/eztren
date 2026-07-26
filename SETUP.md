# Getting from here to fully live

The site works right now with seed data and no backend. These are the only
things left, all manual, all a few minutes each.

## 1. Add the schema to your existing Supabase project

No new project needed — this reuses the same one your Android apps share
(`rrwycwlahzcxldowvfnm.supabase.co`), just in its own schema so it can't
touch Flow Timer / Minima / Daily Logs / Notes App tables.

1. Open that project → SQL Editor → paste the contents of
   `supabase/schema.sql` → Run
   This creates a `eztren` schema with `players`, `matches`,
   `tournaments`, `signups`, sets up row-level security, and seeds the same
   data currently on the site.
2. **Important — this part can only be done in the dashboard, not SQL:**
   Project Settings → API → Data API Settings → **Exposed schemas** → add
   `eztren` to the list (alongside `public`) → Save.
   Without this step the API can't see the new tables even though they exist.
3. Settings → API → copy the **Project URL** and the **anon public key**
   (same ones your Android apps already use, if you have them handy)

## 2. Deploy to Vercel

1. vercel.com → New Project → Import `SamarthKulkarni16/eztren`
2. Before deploying, add two Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` → the Project URL from step 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the anon key from step 1
3. Deploy

No code changes needed either way — `lib/supabase.ts` checks for those two
variables and automatically switches from the seed data in `lib/data.ts` to
live queries against the `eztren` schema the moment they're set.

## 3. Turn on magic-link sign-in

1. Run `supabase/003_auth.sql` in the SQL Editor (adds `user_id` to
   `players` and switches `register_player` to require a verified session).
2. Authentication → Providers → **Email** should already be on by default
   for a new project — that's all magic link needs, no separate toggle.
3. Authentication → URL Configuration:
   - **Site URL** → your production URL once deployed (e.g.
     `https://eztren.vercel.app`)
   - **Redirect URLs** → add `https://eztren.vercel.app/join` (or
     whatever your actual domain ends up being)
   Without this step, clicking the magic link will bounce to the wrong
   place or get rejected.
4. If you're testing locally before deploying, also add
   `http://localhost:3000/join` to Redirect URLs.

## What still won't work yet (deliberately out of scope for this pass)

- Admin UI for entering match results — for now that's a row insert in the
  Supabase table editor, or I can build a simple form for it next.
- Video/transcript hosting — `video_url` / `transcript_url` are plain text
  columns; wiring these to Cloudflare R2 (already set up for Instagram) is
  a small follow-up once real matches start getting recorded.
- Custom domain — you'll be on a `.vercel.app` URL until you point one at it.
