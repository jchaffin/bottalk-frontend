"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentAvatar from "./AgentAvatar";
import Transcript from "./Transcript";
import type { TranscriptLine } from "../lib/api";

interface CallProviderProps {
  roomUrl: string;
  token: string;
  onLeave?: () => void;
}

export default function CallProvider({
  roomUrl,
  token,
  onLeave,
}: CallProviderProps) {
  const [status, setStatus] = useState("Connecting...");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [sarahSpeaking, setSarahSpeaking] = useState(false);
  const [mikeSpeaking, setMikeSpeaking] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const destroyedRef = useRef(false);
  const participantsRef = useRef<Record<string, string>>({});


  // ---- Daily call for audio only ----
  useEffect(() => {
    destroyedRef.current = false;

    import("@daily-co/daily-js").then((mod) => {
      if (destroyedRef.current) return;
      if ((containerRef as any)._call) return;
      const DailyIframe = mod.default;

      const call = DailyIframe.createCallObject({
        audioSource: false,
        videoSource: false,
        subscribeToTracksAutomatically: true,
      });
      (containerRef as any)._call = call;

      // Audio elements for remote participants
      const audioEls: Record<string, HTMLAudioElement> = {};

      function ensureAudio(sid: string, track: MediaStreamTrack) {
        if (audioEls[sid]) {
          // Only replace the MediaStream when the track actually changes.
          // participant-updated fires 30-60×/sec; creating a new
          // MediaStream every time hammers the main thread and starves rAF.
          const current = (audioEls[sid].srcObject as MediaStream | null)
            ?.getAudioTracks()[0];
          if (current === track) return;
          audioEls[sid].srcObject = new MediaStream([track]);
          return;
        }
        const el = document.createElement("audio");
        el.autoplay = true;
        el.srcObject = new MediaStream([track]);
        containerRef.current?.appendChild(el);
        audioEls[sid] = el;
      }

      function cleanupAudio(sid: string) {
        const el = audioEls[sid];
        if (el) { el.srcObject = null; el.remove(); delete audioEls[sid]; }
      }

      call.on("joined-meeting", () => {
        const all = call.participants();
        for (const [k, p] of Object.entries(all)) {
          if (k === "local") continue;
          if (p.user_name) participantsRef.current[p.session_id] = p.user_name;
        }
        setStatus("Listening...");
      });

      call.on("participant-joined", (ev) => {
        if (!ev) return;
        if (ev.participant.user_name)
          participantsRef.current[ev.participant.session_id] = ev.participant.user_name;
      });

      // Track speaking state in a ref so participant-updated (which fires
      // dozens of times/sec) only triggers a React re-render when the value
      // actually changes. Without this, every event re-renders CallProvider
      // which cascades into Transcript and kills performance.
      const speakingState = { Sarah: false, Mike: false };

      call.on("participant-updated", (ev) => {
        if (!ev) return;
        const p = ev.participant;
        if (p.user_name) participantsRef.current[p.session_id] = p.user_name;
        const audioTrack = p.tracks?.audio;
        if (audioTrack?.persistentTrack) ensureAudio(p.session_id, audioTrack.persistentTrack);
        const name = participantsRef.current[p.session_id];
        const speaking = audioTrack?.state === "playable";
        if (name === "Sarah" && speakingState.Sarah !== speaking) {
          speakingState.Sarah = speaking;
          setSarahSpeaking(speaking);
        } else if (name === "Mike" && speakingState.Mike !== speaking) {
          speakingState.Mike = speaking;
          setMikeSpeaking(speaking);
        }
      });

      call.on("participant-left", (ev) => {
        if (!ev) return;
        cleanupAudio(ev.participant.session_id);
        delete participantsRef.current[ev.participant.session_id];
      });

      // bot-llm-text: LLM tokens as they stream — fast, instant text.
      // bot-llm-stopped: fires once per full LLM response — proper turn boundary.
      // Tokens are buffered in a plain array and flushed to React via rAF
      // so we never re-render more than once per frame.
      //
      // To avoid O(n) work that grows with conversation length, we only pass
      // the last MAX_VISIBLE lines to React. The full history stays in
      // linesSnapshot for bookkeeping; React never sees the full array.
      const MAX_VISIBLE = 200;
      const activeLine: Record<string, number> = {}; // fromId -> index in lines
      let linesSnapshot: TranscriptLine[] = [];
      let nextLineId = 0;
      let flushQueued = false;

      function queueFlush() {
        if (flushQueued) return;
        flushQueued = true;
        requestAnimationFrame(() => {
          flushQueued = false;
          // slice() always returns a new array reference (so React
          // detects the change) and caps at MAX_VISIBLE entries.
          setLines(linesSnapshot.slice(-MAX_VISIBLE));
        });
      }

      call.on("app-message", (ev) => {
        if (!ev?.data?.label || ev.data.label !== "rtvi-ai") return;
        const msg = ev.data;
        const fromId = ev.fromId;
        const speaker = participantsRef.current[fromId] || "Unknown";

        // bot-llm-started fires when a new LLM generation begins.
        // Clear any stale activeLine so the next bot-llm-text creates
        // a fresh line instead of appending to a previous turn.
        if (msg.type === "bot-llm-started") {
          delete activeLine[fromId];
        }

        if (msg.type === "bot-llm-text" && msg.data?.text) {
          const text = msg.data.text;
          const idx = activeLine[fromId];

          // If we have an active line for this speaker, append to it
          if (idx !== undefined && idx < linesSnapshot.length && linesSnapshot[idx].speaker === speaker) {
            linesSnapshot[idx] = { ...linesSnapshot[idx], text: linesSnapshot[idx].text + text };
          }
          // No active line, but last line is the same speaker —
          // bot-llm-stopped can fire between LLM chunks within the same turn.
          else if (linesSnapshot.length > 0 && linesSnapshot[linesSnapshot.length - 1].speaker === speaker) {
            const last = linesSnapshot.length - 1;
            activeLine[fromId] = last;
            linesSnapshot[last] = { ...linesSnapshot[last], text: linesSnapshot[last].text + text };
          }
          // New speaker turn — start a new line
          else {
            const id = nextLineId++;
            activeLine[fromId] = linesSnapshot.length;
            linesSnapshot.push({ id, speaker, text });
          }

          queueFlush();
        }

        if (msg.type === "bot-llm-stopped") {
          delete activeLine[fromId];
        }
      });

      call.on("track-started", (ev) => {
        if (!ev || !ev.participant) return;
        if (ev.track?.kind === "audio") ensureAudio(ev.participant.session_id, ev.track);
      });

      call.on("track-stopped", (ev) => {
        if (!ev || !ev.participant) return;
        if (ev.track?.kind === "audio") cleanupAudio(ev.participant.session_id);
      });

      call.on("left-meeting", () => {
        setStatus("Disconnected");
        Object.keys(audioEls).forEach(cleanupAudio);
        onLeave?.();
      });

      call.join({ url: roomUrl, token })
        .then(() => {
          setStatus("Connected - listening to the conversation");
        })
        .catch((err) => setStatus(`Error: ${err.message}`));
    });

    return () => {
      destroyedRef.current = true;
      const call = (containerRef as any)._call;
      if (call) {
        (containerRef as any)._call = null;
        call.leave().then(() => call.destroy()).catch(() => call.destroy());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div ref={containerRef} className="hidden" />
      <div className="flex gap-12">
        <AgentAvatar name="Sarah" initial="S" color="bg-[#2a4a7f]" speaking={sarahSpeaking} />
        <AgentAvatar name="Mike" initial="M" color="bg-[#4a2a6f]" speaking={mikeSpeaking} />
      </div>
      <Transcript lines={lines} />
      <p className="text-xs text-gray-500">{status}</p>
    </div>
  );
}
