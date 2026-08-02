import { useCallback, useEffect, useRef, useState } from "react";
import { sendTurn } from "@/lib/battle";

// Live transcription for audio battles, done entirely in the browser so the
// AI judge can read a transcript instead of paying to process raw audio —
// same trick as the client-side recorder in useAudioRecorder.ts, but for
// Gemini tokens instead of Daily minutes.
//
// Each participant's own tab runs SpeechRecognition on their own mic only
// (that's just how the API works — it listens to the default input device,
// not an arbitrary stream), so there's no cross-talk or duplicate-speaker
// problem to solve: player A's browser produces player A's lines, player
// B's browser produces player B's lines, and both write into the same
// battle_turns table complete_battle() already compiles by timestamp.
//
// If this browser doesn't support it, or recognition fails outright (mic
// permission denied, no network, etc.), `failed` flips true and this
// speaker simply contributes nothing to the transcript. That's fine: the
// judge route falls back to the recorded audio whenever the compiled
// transcript is missing either speaker's lines.
export function useSpeechTranscription(battleId: string, playerId: string) {
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);

  const recognitionRef = useRef<any>(null);
  const stoppedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  const start = useCallback(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setFailed(true);
      return;
    }

    stoppedRef.current = false;
    consecutiveErrorsRef.current = 0;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event: any) => {
      consecutiveErrorsRef.current = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text: string = result[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        // Best-effort — a dropped segment just shrinks this speaker's share
        // of the transcript rather than breaking anything.
        sendTurn(battleId, playerId, text);
      }
    };

    recognition.onerror = (event: any) => {
      // Fires constantly during natural pauses in conversation — not a
      // real error, and restarting on it would just cause churn.
      if (event.error === "no-speech") return;

      // Permission or platform-level block — retrying won't help, stop for
      // good and let the audio-recording fallback carry this speaker.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stoppedRef.current = true;
        setFailed(true);
        setActive(false);
        return;
      }

      // Transient errors (network blips, aborted) are expected occasionally
      // over a long debate — onend below will restart it. Only give up if
      // they're clearly not transient anymore.
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 5) {
        stoppedRef.current = true;
        setFailed(true);
        setActive(false);
      }
    };

    recognition.onend = () => {
      // Browsers stop SpeechRecognition on their own after a period of
      // silence or an internal time limit even mid-battle — restart
      // transparently unless we deliberately stopped it.
      if (stoppedRef.current) {
        setActive(false);
        return;
      }
      try {
        recognition.start();
      } catch {
        // Already starting — safe to ignore.
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setActive(true);
    } catch {
      setFailed(true);
    }
  }, [battleId, playerId]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      // no-op
    }
    recognitionRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  return { supported, active, failed, start, stop };
}
