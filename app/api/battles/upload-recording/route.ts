import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// R2 credentials are server-only — this route exists specifically so the
// browser never sees them. The client (hooks/useAudioRecorder.ts) posts the
// recorded blob here as multipart form data along with its own auth token.

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL; // e.g. https://recordings.eztren.xyz (no trailing slash)

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
  if (typeof battleId !== "string" || !(file instanceof Blob)) {
    return NextResponse.json({ error: "battleId and file required" }, { status: 400 });
  }

  // User-scoped client — RLS ("participants read battle") makes this a
  // clean participant check for free, same pattern as create-room.
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
    // Either it doesn't exist, or RLS hid it because this user isn't a
    // participant — same response either way, no need to distinguish.
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `${battleId}.webm`;

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: "audio/webm",
      })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Upload to R2 failed" }, { status: 500 });
  }

  const recordingUrl = `${publicUrl}/${key}`;

  // Still user-scoped — "participants update battle" policy covers this.
  await supabase.from("battles").update({ recording_url: recordingUrl }).eq("id", battleId);

  return NextResponse.json({ url: recordingUrl });
}
