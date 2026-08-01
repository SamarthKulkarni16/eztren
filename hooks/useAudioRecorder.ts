import { useCallback, useEffect, useRef } from "react";
import { DailyCall } from "@daily-co/daily-js";
import { supabase } from "@/lib/supabase";

// Records the merged (local + remote) audio of a Daily call entirely in the
// browser via MediaRecorder + Web Audio API, so the recording never touches
// Daily's server-side recording meter (which bills per recorded minute with
// no free tier, unlike the call itself). Only the deterministically-assigned
// "recorder" side of the battle actually captures + uploads, so we don't end
// up with two duplicate files per battle.
//
// Tradeoff vs Daily's server-side recording: if the recorder's tab crashes
// mid-battle, that battle has no archive. Text battles don't have this
// failure mode — this is the real cost of making audio archiving free too.
export function useAudioRecorder(battleId: string) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Call this once both local and remote audio tracks exist (e.g. from
  // "participant-joined" or "joined-meeting" if the opponent is already in
  // the room). Safe to call more than once — no-ops if already recording or
  // if a track isn't ready yet.
  const startRecording = useCallback((call: DailyCall): boolean => {
    if (recorderRef.current) return true; // already recording

    const participants = call.participants();
    const localTrack = (participants.local as any)?.tracks?.audio?.persistentTrack as
      | MediaStreamTrack
      | undefined;
    const remoteEntry = Object.values(participants).find((p: any) => !p.local);
    const remoteTrack = (remoteEntry as any)?.tracks?.audio?.persistentTrack as
      | MediaStreamTrack
      | undefined;

    if (!localTrack || !remoteTrack) return false; // opponent's audio not up yet, caller can retry

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(new MediaStream([localTrack])).connect(destination);
    audioContext.createMediaStreamSource(new MediaStream([remoteTrack])).connect(destination);
    audioContextRef.current = audioContext;

    const recorder = new MediaRecorder(destination.stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(1000); // 1s chunks so a crash doesn't lose the whole battle
    recorderRef.current = recorder;
    return true;
  }, []);

  // Stops recording, uploads the merged file to Supabase Storage, and points
  // battles.recording_url at it. Best-effort — a failed upload shouldn't
  // block the battle from ending, so all errors are swallowed.
  const stopAndUpload = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });
    recorderRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    if (!supabase || blob.size === 0) return;

    try {
      const path = `${battleId}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("battle-recordings")
        .upload(path, blob, { contentType: "audio/webm", upsert: true });
      if (uploadError) return;

      const {
        data: { publicUrl },
      } = supabase.storage.from("battle-recordings").getPublicUrl(path);

      await supabase.from("battles").update({ recording_url: publicUrl }).eq("id", battleId);
    } catch {
      // best-effort — see comment above
    }
  }, [battleId]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      audioContextRef.current?.close();
    };
  }, []);

  return { startRecording, stopAndUpload };
}
