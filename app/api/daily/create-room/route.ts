import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route is the only place the Daily API key ever gets touched — it's
// a server-side env var (DAILY_API_KEY), never shipped to the browser.

export async function POST(req: NextRequest) {
  const { battleId } = await req.json();
  if (!battleId) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dailyKey = process.env.DAILY_API_KEY;

  if (!url || !anonKey || !dailyKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // A client scoped to the caller's own session, so RLS enforces that only
  // a real participant in this battle can reach any of this.
  const supabase = createClient(url, anonKey, {
    db: { schema: "eztren" },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .maybeSingle();

  if (battleError || !battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }
  if (battle.format !== "audio") {
    return NextResponse.json({ error: "Not an audio battle" }, { status: 400 });
  }

  // Already created — just hand back the existing room.
  if (battle.daily_room_name && battle.daily_room_url) {
    return NextResponse.json({
      roomUrl: battle.daily_room_url,
      roomName: battle.daily_room_name,
    });
  }

  const roomName = `battle-${battleId}`;
  const expiresAt = Math.floor(Date.now() / 1000) + battle.duration_seconds + 3600; // buffer

  const createRes = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dailyKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: roomName,
      privacy: "public",
      properties: {
        exp: expiresAt,
        max_participants: 200, // Daily's self-serve ceiling — 2 debaters + up to 198 spectators. Going higher needs a direct request to Daily.
        // No enable_recording here on purpose — Daily's cloud recording bills
        // per recorded minute from minute one, no free tier. Audio is now
        // captured client-side (see hooks/useAudioRecorder.ts) and uploaded
        // straight to Supabase Storage, which is free.
        enable_screenshare: false,
        enable_chat: false,
        start_video_off: true,
        start_audio_off: false,
      },
    }),
  });

  const room = await createRes.json();

  // If it already exists on Daily's side (e.g. a retry), just fetch it.
  if (!createRes.ok && room.info?.includes("already exists")) {
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${dailyKey}` },
    });
    const existing = await getRes.json();
    if (!getRes.ok) {
      return NextResponse.json({ error: "Could not fetch existing room" }, { status: 500 });
    }
    await supabase
      .from("battles")
      .update({ daily_room_name: existing.name, daily_room_url: existing.url })
      .eq("id", battleId)
      .is("daily_room_name", null);
    return NextResponse.json({ roomUrl: existing.url, roomName: existing.name });
  }

  if (!createRes.ok) {
    return NextResponse.json({ error: room.error || "Daily room creation failed" }, { status: 500 });
  }

  await supabase
    .from("battles")
    .update({ daily_room_name: room.name, daily_room_url: room.url })
    .eq("id", battleId)
    .is("daily_room_name", null);

  return NextResponse.json({ roomUrl: room.url, roomName: room.name });
}
