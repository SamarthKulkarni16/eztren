import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public on purpose — the archive itself is public, and Daily access links
// expire (they're regenerated fresh on every request, not stored).

export async function POST(req: NextRequest) {
  const { matchId } = await req.json();
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dailyKey = process.env.DAILY_API_KEY;
  if (!url || !anonKey || !dailyKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, { db: { schema: "eztren" } });
  const { data: match } = await supabase
    .from("matches")
    .select("daily_room_name")
    .eq("id", matchId)
    .maybeSingle();

  if (!match?.daily_room_name) {
    return NextResponse.json({ error: "No recording for this match" }, { status: 404 });
  }

  const listRes = await fetch(
    `https://api.daily.co/v1/recordings?room_name=${match.daily_room_name}`,
    { headers: { Authorization: `Bearer ${dailyKey}` } }
  );
  const list = await listRes.json();
  const recording = list.data?.find((r: any) => r.status === "finished");

  if (!recording) {
    return NextResponse.json({ error: "Recording not ready yet" }, { status: 404 });
  }

  const linkRes = await fetch(
    `https://api.daily.co/v1/recordings/${recording.id}/access-link`,
    { headers: { Authorization: `Bearer ${dailyKey}` } }
  );
  const link = await linkRes.json();
  if (!linkRes.ok) {
    return NextResponse.json({ error: "Could not get access link" }, { status: 500 });
  }

  return NextResponse.json({ downloadLink: link.download_link });
}
