import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public route — no auth required, spectating doesn't need an account.
// Issues a Daily meeting token that can only receive audio, never send it,
// and is invisible in the participant list (hasPresence: false) so it
// doesn't trip the "opponent joined" indicator the two real players rely
// on in AudioBattle.tsx.

export async function POST(req: NextRequest) {
  const { battleId } = await req.json();
  if (!battleId) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dailyKey = process.env.DAILY_API_KEY;

  if (!url || !anonKey || !dailyKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // Anon client — relies on the "public read live battles" policy from
  // 018_spectator_mode.sql, so this only ever succeeds for battles that
  // are actually live right now.
  const supabase = createClient(url, anonKey, { db: { schema: "eztren" } });

  const { data: battle, error } = await supabase
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .eq("status", "live")
    .maybeSingle();

  if (error || !battle) {
    return NextResponse.json({ error: "This battle isn't live." }, { status: 404 });
  }
  if (battle.format !== "audio") {
    return NextResponse.json({ error: "Not an audio battle" }, { status: 400 });
  }
  if (!battle.daily_room_name) {
    return NextResponse.json(
      { error: "The call hasn't started yet — try again in a moment." },
      { status: 409 }
    );
  }

  const exp = Math.floor(Date.now() / 1000) + battle.duration_seconds + 3600;

  const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dailyKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: battle.daily_room_name,
        is_owner: false,
        exp,
        permissions: {
          canSend: false,
          canAdmin: false,
          hasPresence: false,
        },
      },
    }),
  });

  const token = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: token.error || "Could not create spectator token" },
      { status: 500 }
    );
  }

  return NextResponse.json({ token: token.token, roomUrl: battle.daily_room_url });
}
