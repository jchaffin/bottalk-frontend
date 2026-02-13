"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentAvatar from "./AgentAvatar";
import Transcript from "./Transcript";
import type { TranscriptLine } from "@/lib/api";
import { AGENT_COLORS, APP_MESSAGE_LABEL } from "@/lib/config";

interface CallProviderProps {
  roomUrl: string;
  token: string;
  agentNames: [string, string];
  onTranscript?: (lines: { speaker: string; text: string }[]) => void;
  onLeave?: () => void;
}

export default function CallProvider({
  roomUrl,
  token,
  agentNames,
  onTranscript,
  onLeave,
}: CallProviderProps) {
  const [status, setStatus] = useState("Connecting...");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const destroyedRef = useRef(false);
  const participantsRef = useRef<Record<string, string>>({});
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  // Build a set of agent names for quick lookup
  const agentNameSet = useRef(new Set(agentNames));
  agentNameSet.current = new Set(agentNames);

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

      // Track speaking state — only re-render when a value actually changes.
      const speakingState: Record<string, boolean> = {};

      call.on("participant-updated", (ev) => {
        if (!ev) return;
        const p = ev.participant;
        if (p.user_name) participantsRef.current[p.session_id] = p.user_name;
        const audioTrack = p.tracks?.audio;
        if (audioTrack?.persistentTrack) ensureAudio(p.session_id, audioTrack.persistentTrack);
        const name = participantsRef.current[p.session_id];
        if (!name || !agentNameSet.current.has(name)) return;
        const speaking = audioTrack?.state === "playable";
        if (speakingState[name] !== speaking) {
          speakingState[name] = speaking;
          setSpeakingMap((prev) => ({ ...prev, [name]: speaking }));
        }
      });

      call.on("participant-left", (ev) => {
        if (!ev) return;
        cleanupAudio(ev.participant.session_id);
        delete participantsRef.current[ev.participant.session_id];
      });

      // bot-llm-text / bot-llm-stopped transcript handling
      const MAX_VISIBLE = 200;
      const activeLine: Record<string, number> = {};
      let linesSnapshot: TranscriptLine[] = [];
      let nextLineId = 0;
      let flushQueued = false;

      function queueFlush() {
        if (flushQueued) return;
        flushQueued = true;
        requestAnimationFrame(() => {
          flushQueued = false;
          setLines(linesSnapshot.slice(-MAX_VISIBLE));
        });
      }

      call.on("app-message", (ev) => {
        if (!ev?.data?.label || ev.data.label !== APP_MESSAGE_LABEL) return;
        const msg = ev.data;
        const fromId = ev.fromId;
        const speaker = participantsRef.current[fromId] || "Unknown";

        if (msg.type === "bot-llm-started") {
          delete activeLine[fromId];
        }

        if (msg.type === "bot-llm-text" && msg.data?.text) {
          const text = msg.data.text;
          const idx = activeLine[fromId];

          if (idx !== undefined && idx < linesSnapshot.length && linesSnapshot[idx].speaker === speaker) {
            linesSnapshot[idx] = { ...linesSnapshot[idx], text: linesSnapshot[idx].text + text };
          } else if (linesSnapshot.length > 0 && linesSnapshot[linesSnapshot.length - 1].speaker === speaker) {
            const last = linesSnapshot.length - 1;
            activeLine[fromId] = last;
            linesSnapshot[last] = { ...linesSnapshot[last], text: linesSnapshot[last].text + text };
          } else {
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
        const toSave = linesSnapshot.map((l) => ({ speaker: l.speaker, text: l.text }));
        onTranscriptRef.current?.(toSave);
        onLeaveRef.current?.();
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
      <div className="flex gap-16">
        {agentNames.map((name, idx) => (
          <AgentAvatar
            key={name}
            name={name}
            initial={name[0]?.toUpperCase() || String(idx + 1)}
            color={AGENT_COLORS[idx] || AGENT_COLORS[0]}
            speaking={!!speakingMap[name]}
          />
        ))}
      </div>
      <Transcript lines={lines} agentNames={agentNames} />
      <p className="text-xs text-muted/60 font-mono">{status}</p>
    </div>
  );
}
