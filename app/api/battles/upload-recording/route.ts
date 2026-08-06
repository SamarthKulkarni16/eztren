import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Same route as before, with one addition: an optional "speaker" field
// ("a" | "b"). Web never sends it, so its behavior — one merged file,
// overwriting battles.recording_url — is completely unchanged. Mobile
// sends it (see lib/localAudioRecorder.ts), so each participant's local
// recording lands as its own R2 object and its own column
// (recording_url_a / recording_url_b) instead of overwriting each other.
//
// Requires 032_dual_recording.sql to have been applied first — without
// those columns this still uploads to R2 fine, the .update() calls for
// recording_url_a/_b just silently no-op (Postgres ignores unknown columns
// in an update only if you're using .update() with PostgREST's schema
// cache... in practice, apply the migration first).

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!url || !anonKey || !accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const formData = await req.formData();
  const battleId = formData.get("battleId");
  const file = formData.get("file");
  const speakerRaw = formData.get("speaker");
  const speaker = speakerRaw === "a" || speakerRaw === "b" ? speakerRaw : null;

  if (typeof battleId !== "string" || !(file instanceof Blob)) {
    return NextResponse.json({ error: "battleId and file required" }, { status: 400 });
  }

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
    .select("id")
    .eq("id", battleId)
    .maybeSingle();
  if (battleError || !battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = speaker ? `${battleId}-${speaker}.m4a` : `${battleId}.webm`;
  const contentType = speaker ? "audio/m4a" : "audio/webm";

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Upload to R2 failed" }, { status: 500 });
  }

  const recordingUrl = `${publicUrl}/${key}`;

  const updateColumn = speaker === "a" ? "recording_url_a" : speaker === "b" ? "recording_url_b" : "recording_url";
  await supabase.from("battles").update({ [updateColumn]: recordingUrl }).eq("id", battleId);

  return NextResponse.json({ url: recordingUrl });
}
