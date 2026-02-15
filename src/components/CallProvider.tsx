"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentAvatar from "./AgentAvatar";
import Transcript from "./Transcript";
import type { TranscriptLine } from "@/lib/api";
import { DEFAULT_AGENT_COLORS, APP_MESSAGE_LABEL } from "@/lib/config";

/**
 * Props for the CallProvider component.
 *
 * @property roomUrl   - Daily room URL to join (created by the backend).
 * @property token     - Meeting token authorising this client as an observer.
 * @property agentNames  - Exactly two agent display-names, used for avatars and
 *                         transcript attribution. Order determines colour assignment.
 * @property agentColors - Hex color strings for each agent avatar.
 * @property onTranscript - Fired once when the call ends, with the full transcript.
 * @property onLeave      - Fired after the local participant has left the meeting.
 */
interface CallProviderProps {
  roomUrl: string;
  token: string;
  agentNames: [string, string];
  agentColors?: [string, string];
  onTranscript?: (lines: { speaker: string; text: string }[]) => void;
  onLeave?: () => void;
}

/**
 * CallProvider
 *
 * Joins a Daily audio-only room as a passive observer (no mic / camera) and
 * renders the two agent avatars with speaking indicators plus a live transcript.
 *
 * Architecture overview:
 *  1. Dynamically imports @daily-co/daily-js so the bundle is only loaded when
 *     a call is actually started.
 *  2. Creates a Daily call-object (audio-only, auto-subscribe) and attaches
 *     event listeners for participant lifecycle, audio tracks, and app-messages.
 *  3. Transcript data arrives via Daily's "app-message" event as incremental
 *     LLM text chunks (RTVI protocol). Chunks are accumulated into
 *     `linesSnapshot` and flushed to React state once per animation frame via
 *     `queueFlush` to avoid excessive re-renders.
 *  4. On unmount (or when roomUrl/token change), the effect's cleanup tears
 *     down the call object gracefully.
 */
export default function CallProvider({
  roomUrl,
  token,
  agentNames,
  agentColors = DEFAULT_AGENT_COLORS,
  onTranscript,
  onLeave,
}: CallProviderProps) {
  // ── React state ──────────────────────────────────────────────────────
  /** Human-readable connection status shown at the bottom of the UI. */
  const [status, setStatus] = useState("Connecting...");
  /** Transcript lines currently rendered in the Transcript component. */
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  /** Map of agent name → whether that agent's audio track is currently playable. */
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});

  // ── Refs ──────────────────────────────────────────────────────────────
  /** Hidden DOM node that hosts dynamically-created <audio> elements. */
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Guard flag set to `true` during cleanup so the async Daily import
   * callback can bail out if the component unmounted before it resolved.
   */
  const destroyedRef = useRef(false);
  /**
   * Maps Daily session_id → human-readable participant name.
   * Kept outside React state because it's read synchronously inside
   * high-frequency event handlers and never needs to trigger re-renders.
   */
  const participantsRef = useRef<Record<string, string>>({});
  /**
   * Stable refs for the callback props so the effect closure always
   * calls the latest version without needing them in the dep array.
   */
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  /**
   * Set of known agent names, rebuilt on each render so that
   * participant-updated handlers can cheaply check whether a participant
   * is one of our agents.
   */
  const agentNameSet = useRef(new Set(agentNames));
  agentNameSet.current = new Set(agentNames);

  // ── Main effect: Daily call lifecycle ─────────────────────────────────
  useEffect(() => {
    destroyedRef.current = false;

    // Dynamic import keeps @daily-co/daily-js out of the initial bundle.
    import("@daily-co/daily-js").then((mod) => {
      // Bail out if the component unmounted while the import was in flight.
      if (destroyedRef.current) return;
      // Prevent double-initialisation (React strict-mode fires effects twice).
      if ((containerRef as any)._call) return;
      const DailyIframe = mod.default;

      // Create an audio-only call object — no local mic or camera.
      const call = DailyIframe.createCallObject({
        audioSource: false,   // don't request microphone
        videoSource: false,   // don't request camera
        subscribeToTracksAutomatically: true, // auto-subscribe to remote tracks
      });
      // Stash the call on the ref so cleanup and guard checks can access it.
      (containerRef as any)._call = call;

      // ── Audio element management ────────────────────────────────────
      // We play remote audio by creating hidden <audio> DOM elements.
      // Each keyed by the participant's session_id.
      const audioEls: Record<string, HTMLAudioElement> = {};

      /**
       * Ensures an <audio> element exists for the given session and is
       * playing the provided track. If the element already exists but is
       * playing a different track, it swaps the source. If no element
       * exists yet, one is created and appended to the hidden container.
       */
      function ensureAudio(sid: string, track: MediaStreamTrack) {
        if (audioEls[sid]) {
          // Element exists — check if the track changed.
          const current = (audioEls[sid].srcObject as MediaStream | null)
            ?.getAudioTracks()[0];
          if (current === track) return; // same track, nothing to do
          audioEls[sid].srcObject = new MediaStream([track]);
          return;
        }
        // First time seeing this participant's audio — create a new element.
        const el = document.createElement("audio");
        el.autoplay = true;
        el.srcObject = new MediaStream([track]);
        containerRef.current?.appendChild(el);
        audioEls[sid] = el;
      }

      /**
       * Tears down the <audio> element for a participant: releases the
       * media stream, removes the DOM node, and deletes the reference.
       */
      function cleanupAudio(sid: string) {
        const el = audioEls[sid];
        if (el) { el.srcObject = null; el.remove(); delete audioEls[sid]; }
      }

      // ── Daily event handlers ────────────────────────────────────────

      /**
       * "joined-meeting" fires once the local participant has connected.
       * We iterate all existing remote participants to populate our
       * session_id → name map, then update the UI status.
       */
      call.on("joined-meeting", () => {
        const all = call.participants();
        for (const [k, p] of Object.entries(all)) {
          if (k === "local") continue; // skip ourselves
          if (p.user_name) participantsRef.current[p.session_id] = p.user_name;
        }
        setStatus("Listening...");
      });

      /**
       * "participant-joined" — a new remote participant enters the room.
       * Record their session_id → name mapping for later attribution.
       */
      call.on("participant-joined", (ev) => {
        if (!ev) return;
        if (ev.participant.user_name)
          participantsRef.current[ev.participant.session_id] = ev.participant.user_name;
      });

      // ── Speaking-indicator tracking ─────────────────────────────────
      // We maintain a local (non-React) mirror of who is speaking so we
      // can skip setSpeakingMap calls when nothing actually changed.
      // participant-updated fires very frequently, so this avoids
      // unnecessary re-renders.
      const speakingState: Record<string, boolean> = {};

      /**
       * "participant-updated" fires on any property change for a
       * participant (track state, name, etc.). We use it to:
       *  1. Keep participantsRef and audio elements up to date.
       *  2. Derive speaking state from the audio track's "playable" status.
       */
      call.on("participant-updated", (ev) => {
        if (!ev) return;
        const p = ev.participant;
        // Keep the name map fresh (names can arrive late).
        if (p.user_name) participantsRef.current[p.session_id] = p.user_name;
        // Make sure we're playing this participant's audio.
        const audioTrack = p.tracks?.audio;
        if (audioTrack?.persistentTrack) ensureAudio(p.session_id, audioTrack.persistentTrack);
        // Only track speaking state for our known agents.
        const name = participantsRef.current[p.session_id];
        if (!name || !agentNameSet.current.has(name)) return;
        // "playable" means the track is unmuted and producing audio.
        const speaking = audioTrack?.state === "playable";
        if (speakingState[name] !== speaking) {
          speakingState[name] = speaking;
          setSpeakingMap((prev) => ({ ...prev, [name]: speaking }));
        }
      });

      /**
       * "participant-left" — clean up audio elements and the name map
       * entry for a departing participant.
       */
      call.on("participant-left", (ev) => {
        if (!ev) return;
        cleanupAudio(ev.participant.session_id);
        delete participantsRef.current[ev.participant.session_id];
      });

      // ── Transcript accumulation (RTVI app-messages) ─────────────────
      // The pipecat agents send LLM output as incremental "app-message"
      // events with types: bot-llm-started, bot-llm-text, bot-llm-stopped.
      //
      // We accumulate text chunks into `linesSnapshot` (a plain array
      // outside React state) and batch-flush to React via `queueFlush`.

      /** Maximum number of transcript lines kept in the rendered list. */
      const MAX_VISIBLE = 200;
      /**
       * Maps a Daily session_id (fromId) to the index in `linesSnapshot`
       * where that participant's currently-active line lives. Reset on
       * bot-llm-started / bot-llm-stopped so the next chunk starts a
       * new line (or merges with an adjacent same-speaker line).
       */
      const activeLine: Record<string, number> = {};
      /** The authoritative transcript array; flushed to React state in batches. */
      let linesSnapshot: TranscriptLine[] = [];
      /** Auto-incrementing unique key for React list rendering. */
      let nextLineId = 0;
      let flushQueued = false;

      // Batches transcript state updates into a single render per animation frame.
      // Without this, every incremental "bot-llm-text" chunk would trigger a
      // separate React re-render. Instead, we set a flag and schedule a
      // requestAnimationFrame callback that commits the latest linesSnapshot
      // (trimmed to MAX_VISIBLE) in one go. The flag prevents redundant rAF
      // calls if multiple chunks arrive within the same frame.
      function queueFlush() {
        if (flushQueued) return; // already scheduled — skip
        flushQueued = true;
        requestAnimationFrame(() => {
          flushQueued = false;
          // Commit only the most recent MAX_VISIBLE lines to React state
          setLines(linesSnapshot.slice(-MAX_VISIBLE));
        });
      }

      /**
       * "app-message" — the main transcript ingestion handler.
       *
       * Message flow per LLM turn:
       *   bot-llm-started  → reset the active line for this sender
       *   bot-llm-text (×N) → append text to the current line (or create one)
       *   bot-llm-stopped  → finalise the active line for this sender
       *
       * Text chunks are appended to `linesSnapshot` using three strategies:
       *   1. If we already have an activeLine index for this sender, append there.
       *   2. Else if the last line in the snapshot is from the same speaker,
       *      treat it as a continuation (handles back-to-back chunks).
       *   3. Otherwise, push a brand-new line.
       */
      call.on("app-message", (ev) => {
        // Ignore messages that aren't tagged with our RTVI label.
        if (!ev?.data?.label || ev.data.label !== APP_MESSAGE_LABEL) return;
        const msg = ev.data;
        const fromId = ev.fromId;
        const speaker = participantsRef.current[fromId] || "Unknown";

        // --- bot-llm-started: new LLM turn begins ---
        if (msg.type === "bot-llm-started") {
          delete activeLine[fromId];
        }

        // --- bot-llm-text: incremental token/chunk ---
        if (msg.type === "bot-llm-text" && msg.data?.text) {
          const text = msg.data.text;
          const idx = activeLine[fromId];

          if (idx !== undefined && idx < linesSnapshot.length && linesSnapshot[idx].speaker === speaker) {
            // Strategy 1: append to the tracked active line for this sender.
            linesSnapshot[idx] = { ...linesSnapshot[idx], text: linesSnapshot[idx].text + text };
          } else if (linesSnapshot.length > 0 && linesSnapshot[linesSnapshot.length - 1].speaker === speaker) {
            // Strategy 2: last line is the same speaker — merge into it.
            const last = linesSnapshot.length - 1;
            activeLine[fromId] = last;
            linesSnapshot[last] = { ...linesSnapshot[last], text: linesSnapshot[last].text + text };
          } else {
            // Strategy 3: new speaker turn — push a fresh line.
            const id = nextLineId++;
            activeLine[fromId] = linesSnapshot.length;
            linesSnapshot.push({ id, speaker, text });
          }

          queueFlush();
        }

        // --- bot-llm-stopped: LLM turn complete ---
        if (msg.type === "bot-llm-stopped") {
          delete activeLine[fromId];
        }
      });

      // ── Track lifecycle events ──────────────────────────────────────
      // These are a secondary way to attach / detach audio (in addition
      // to participant-updated). They handle edge cases where a track
      // starts or stops independently of the participant object updating.

      call.on("track-started", (ev) => {
        if (!ev || !ev.participant) return;
        if (ev.track?.kind === "audio") ensureAudio(ev.participant.session_id, ev.track);
      });

      call.on("track-stopped", (ev) => {
        if (!ev || !ev.participant) return;
        if (ev.track?.kind === "audio") cleanupAudio(ev.participant.session_id);
      });

      // ── Meeting end ─────────────────────────────────────────────────
      /**
       * "left-meeting" fires when we (or the server) end the call.
       * Clean up all audio elements and surface the final transcript
       * to the parent via onTranscript, then signal onLeave.
       */
      call.on("left-meeting", () => {
        setStatus("Disconnected");
        Object.keys(audioEls).forEach(cleanupAudio);
        // Strip internal `id` field before handing transcript to parent.
        const toSave = linesSnapshot.map((l) => ({ speaker: l.speaker, text: l.text }));
        onTranscriptRef.current?.(toSave);
        onLeaveRef.current?.();
      });

      // ── Join the room ───────────────────────────────────────────────
      call.join({ url: roomUrl, token })
        .then(() => {
          setStatus("Connected - listening to the conversation");
        })
        .catch((err) => setStatus(`Error: ${err.message}`));
    });

    // ── Cleanup on unmount or dependency change ─────────────────────────
    return () => {
      destroyedRef.current = true;
      const call = (containerRef as any)._call;
      if (call) {
        (containerRef as any)._call = null;
        // leave() is async; destroy() runs regardless of success/failure.
        call.leave().then(() => call.destroy()).catch(() => call.destroy());
      }
    };
    // Only re-run when the room or token change — callback refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Hidden container for dynamically-created <audio> elements */}
      <div ref={containerRef} className="hidden" />

      {/* Agent avatars with speaking-pulse indicators */}
      <div className="flex gap-16">
        {agentNames.map((name, idx) => (
          <AgentAvatar
            key={name}
            name={name}
            initial={name[0]?.toUpperCase() || String(idx + 1)}
            color={agentColors[idx] || DEFAULT_AGENT_COLORS[0]}
            speaking={!!speakingMap[name]}
          />
        ))}
      </div>

      {/* Live transcript feed */}
      <Transcript lines={lines} agentNames={agentNames} />

      {/* Connection status indicator */}
      <p className="text-xs text-muted/60 font-mono">{status}</p>
    </div>
  );
}
