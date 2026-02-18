"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";
import AgentAvatar from "./AgentAvatar";
import Transcript from "./Transcript";
import type { TranscriptLine } from "@/lib/api";
import { DEFAULT_AGENT_COLORS } from "@/lib/config";

/** A single latency metric event collected during the call. */
export interface TurnMetric {
  agent: string;
  turn?: number;
  ttfb?: number;
  llm?: number;
  tts?: number;
  e2e?: number;
  ts?: number;
}

/**
 * Props for the CallProvider component.
 *
 * @property roomUrl   - Daily room URL to join (created by the backend).
 * @property token     - Meeting token authorising this client as an observer.
 * @property agentNames  - Exactly two agent display-names, used for avatars and
 *                         transcript attribution. Order determines colour assignment.
 * @property agentColors - Hex color strings for each agent avatar.
 * @property onTranscript - Fired once when the call ends, with the full transcript.
 * @property onMetrics    - Fired once when the call ends, with collected latency metrics.
 * @property onLeave      - Fired after the local participant has left the meeting.
 */
interface CallProviderProps {
  roomUrl: string;
  token: string;
  agentNames: [string, string];
  agentColors?: [string, string];
  /** Title for the conversation record (used when auto-saving). */
  title?: string;
  onTranscript?: (lines: { speaker: string; text: string }[]) => void;
  onMetrics?: (metrics: TurnMetric[]) => void;
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
 *  3. Transcript data arrives via Daily's "transcription-message" event
 *     (room-level Deepgram). Final and interim transcriptions are accumulated
 *     into `linesSnapshot` and flushed to React state once per animation
 *     frame via `queueFlush` to avoid excessive re-renders.
 *  4. On unmount (or when roomUrl/token change), the effect's cleanup tears
 *     down the call object gracefully.
 */
export default function CallProvider({
  roomUrl,
  token,
  agentNames,
  agentColors = DEFAULT_AGENT_COLORS,
  title,
  onTranscript,
  onMetrics,
  onLeave,
}: CallProviderProps) {
  // ── React state ──────────────────────────────────────────────────────
  const [status, setStatus] = useState("Connecting...");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [liveMetrics, setLiveMetrics] = useState<TurnMetric[]>([]);
  const [muted, setMuted] = useState(false);
  /** Live summary generated during the call. */
  const [liveSummary, setLiveSummary] = useState<string | null>(null);
  /** Live KPI outcome from incremental classification. */
  const [liveOutcome, setLiveOutcome] = useState<string | null>(null);

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
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const titleRef = useRef(title);
  titleRef.current = title;

  /** ID of the conversation record created in the DB. */
  const conversationIdRef = useRef<string | null>(null);
  /** Number of lines already saved/synced to the server. */
  const savedLineCountRef = useRef(0);
  /** Debounce timer for incremental save. */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Number of turns since the last summary refresh. */
  const turnsSinceLastSummaryRef = useRef(0);

  const agentNameSet = useRef(new Set(agentNames));
  agentNameSet.current = new Set(agentNames);

  // ── Sync muted state to all <audio> elements ────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.querySelectorAll("audio").forEach((a) => { a.muted = muted; });
  }, [muted]);

  // ── Real-time save / embed / classify / summarize ────────────────────

  /**
   * Called after each new turn. Creates the conversation record on the
   * first call, then incrementally updates it (triggering server-side
   * embed + classify). Fetches a fresh summary every 3 turns.
   */
  function scheduleIncrementalSave(
    currentLines: { speaker: string; text: string }[],
    currentMetrics: TurnMetric[],
  ) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Debounce slightly so rapid-fire metric patches don't spam the server
    saveTimerRef.current = setTimeout(async () => {
      try {
        if (currentLines.length === 0) return;

        if (!conversationIdRef.current) {
          // First save: create the record
          const res = await fetch("/api/transcripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: titleRef.current || `${agentNames[0]} & ${agentNames[1]}`,
              agentNames: [...agentNames],
              lines: currentLines,
              roomUrl,
              latencyMetrics: currentMetrics,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            conversationIdRef.current = data.id;
            savedLineCountRef.current = currentLines.length;
            console.debug("[CallProvider] Created conversation:", data.id);
          }
        } else {
          // Incremental update: PATCH with full lines (server diffs for embeddings)
          const res = await fetch(`/api/transcripts/${conversationIdRef.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lines: currentLines,
              latencyMetrics: currentMetrics,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            savedLineCountRef.current = currentLines.length;
            // Pick up outcome from incremental classification
            if (data.outcome) setLiveOutcome(data.outcome);
          }
        }

        // Fetch a live summary every 3 turns
        turnsSinceLastSummaryRef.current++;
        if (turnsSinceLastSummaryRef.current >= 3) {
          turnsSinceLastSummaryRef.current = 0;
          const sumRes = await fetch("/api/transcripts/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines: currentLines }),
          });
          if (sumRes.ok) {
            const { summary } = await sumRes.json();
            if (summary) {
              setLiveSummary(summary);
              // Persist summary to the conversation record
              if (conversationIdRef.current) {
                fetch(`/api/transcripts/${conversationIdRef.current}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ summary }),
                }).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error("[CallProvider] Incremental save error:", err);
      }
    }, 500);
  }

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
        el.muted = mutedRef.current;
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
          if (k === "local") continue;
          if (p.user_name) {
            participantsRef.current[p.session_id] = p.user_name;
            if ((p as any).user_id) participantsRef.current[(p as any).user_id] = p.user_name;
          }
        }
        console.debug("[CallProvider] joined, participants:", { ...participantsRef.current });
        setStatus("Listening...");
      });

      call.on("transcription-started", (ev: any) => {
        console.debug("[CallProvider] transcription-started", ev);
      });

      call.on("transcription-error", (ev: any) => {
        console.error("[CallProvider] transcription-error", ev);
      });

      // app-message events are high-frequency (RTVI frames, metrics, etc.)
      // — no handler needed; transcription comes via "transcription-message".

      /**
       * "participant-joined" — a new remote participant enters the room.
       * Record their session_id and user_id → name mappings.
       */
      call.on("participant-joined", (ev) => {
        if (!ev) return;
        if (ev.participant.user_name) {
          participantsRef.current[ev.participant.session_id] = ev.participant.user_name;
          if ((ev.participant as any).user_id)
            participantsRef.current[(ev.participant as any).user_id] = ev.participant.user_name;
        }
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

      // ── Transcript accumulation ─────────────────────────────────────────
      const MAX_VISIBLE = 200;
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

      // ── WebSocket transcript relay (dev mode) ─────────────────────────
      // In local dev the agent API server relays pipeline-internal turn
      // events over a WebSocket.  This delivers complete LLM output text
      // whereas Daily's transcription-message is Deepgram STT of the
      // TTS audio.  When the WS relay is delivering data, we prefer it.
      // The Daily handler is always active as a fallback.

      let wsDeliveredData = false;
      let ws: WebSocket | null = null;
      const agentApiUrl = process.env.NEXT_PUBLIC_API_URL;

      // Per-turn latency metrics collected from WS events
      const metricsSnapshot: TurnMetric[] = [];
      // Accumulate per-agent partial metrics until a "turn" event finalises them
      const pendingMetrics: Record<string, Partial<TurnMetric>> = {};

      if (agentApiUrl) {
        const wsProto = agentApiUrl.startsWith("https") ? "wss" : "ws";
        const wsHost = agentApiUrl.replace(/^https?:\/\//, "");
        const wsEndpoint = `${wsProto}://${wsHost}/ws`;

        ws = new WebSocket(wsEndpoint);

        ws.onopen = () => {
          console.debug("[CallProvider] WebSocket transcript relay connected");
        };

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            const agent: string = data.agent || "Unknown";

            /** Update the pending bucket and, if the turn line already
             *  exists, patch its metrics + the metricsSnapshot entry.
             *  Uses max-wins strategy so later 0ms chunk events don't
             *  overwrite a real value. */
            function applyMetric(key: keyof TurnMetric, ms: number) {
              if (!pendingMetrics[agent]) pendingMetrics[agent] = { agent };
              const prev = (pendingMetrics[agent] as any)[key];
              const best = (typeof prev === "number" && prev > ms) ? prev : ms;
              (pendingMetrics[agent] as any)[key] = best;

              // Late-arriving metric: patch the last committed line for this agent
              const lastLine = [...linesSnapshot].reverse().find((l) => l.speaker === agent);
              if (lastLine?.metrics) {
                const linePrev = (lastLine.metrics as any)[key];
                (lastLine.metrics as any)[key] = (typeof linePrev === "number" && linePrev > best) ? linePrev : best;
                queueFlush();
              }
              // Also patch the metricsSnapshot entry
              const lastMetric = [...metricsSnapshot].reverse().find((m) => m.agent === agent);
              if (lastMetric) {
                const metPrev = (lastMetric as any)[key];
                (lastMetric as any)[key] = (typeof metPrev === "number" && metPrev > best) ? metPrev : best;
                setLiveMetrics([...metricsSnapshot]);
              }
            }

            if (data.type === "ttfb") {
              const val = data.value ?? 0;
              if (val <= 0) return;
              const processor = (data.processor || "").toLowerCase();
              const isTts = processor.includes("tts") || processor.includes("elevenlabs") || processor.includes("cartesia");
              // LLM TTFB → "ttfb" field; TTS TTFB is less useful, skip it
              if (!isTts) {
                applyMetric("ttfb", Math.round(val * 1000));
              }
            } else if (data.type === "processing") {
              const val = data.value ?? 0;
              if (val <= 0) return;
              const processor = (data.processor || "").toLowerCase();
              const ms = Math.round(val * 1000);
              const isTts = processor.includes("tts") || processor.includes("elevenlabs") || processor.includes("cartesia");
              if (isTts) {
                applyMetric("tts", ms);
              } else {
                applyMetric("llm", ms);
              }
            } else if (data.type === "e2e") {
              const val = data.value ?? 0;
              if (val <= 0) return;
              applyMetric("e2e", Math.round(val * 1000));
            } else if (data.type === "turn") {
              const speaker = agent;
              const text = data.output || "";

              // Finalise the metrics record for this turn
              const pending = pendingMetrics[agent] || { agent };
              if (data.e2e != null && !pending.e2e) {
                pending.e2e = Math.round((data.e2e ?? 0) * 1000);
              }
              const metric: TurnMetric = {
                ...pending,
                agent,
                turn: data.turn ?? metricsSnapshot.filter((m) => m.agent === agent).length + 1,
                ts: data.ts,
              };
              metricsSnapshot.push(metric);
              setLiveMetrics([...metricsSnapshot]);
              delete pendingMetrics[agent];

              // Transcript line with per-turn latency attached
              if (!text) return;
              wsDeliveredData = true;
              linesSnapshot.push({
                id: nextLineId++,
                speaker,
                text,
                metrics: {
                  ttfb: metric.ttfb,
                  llm: metric.llm,
                  tts: metric.tts,
                  e2e: metric.e2e,
                },
              });
              queueFlush();

              // Real-time save / embed / classify / summarize
              const cleanLines = linesSnapshot
                .filter((l) => !l.interim)
                .map((l) => ({ speaker: l.speaker, text: l.text }));
              scheduleIncrementalSave(cleanLines, [...metricsSnapshot]);
            }
          } catch { /* ignore malformed frames */ }
        };

        ws.onclose = () => {
          console.debug("[CallProvider] WebSocket transcript relay disconnected");
        };
        ws.onerror = () => {};

        // Stash for cleanup
        (containerRef as any)._ws = ws;
      }

      // ── Daily transcription (room-level Deepgram) ──────────────────────
      // Daily broadcasts transcription-message events to all participants.
      // If the WS relay has already delivered data, skip to avoid
      // duplicates.  Otherwise this is the primary transcript source.
      call.on("transcription-message", (msg: any) => {
        if (wsDeliveredData) return; // WS relay is active — skip
        if (!msg) return;
        const text = msg.text;
        if (!text) return;
        const isFinal = msg.rawResponse?.is_final ?? true;
        const sid = msg.participantId || msg.session_id || "";
        const speaker = participantsRef.current[sid] || "Unknown";
        if (speaker === "Unknown") {
          console.debug("[transcript] unknown speaker, sid:", sid, "map:", { ...participantsRef.current }, "msg keys:", Object.keys(msg));
        }

        const last = linesSnapshot.length > 0 ? linesSnapshot[linesSnapshot.length - 1] : null;

        if (isFinal) {
          if (last && last.speaker === speaker && last.interim) {
            linesSnapshot[linesSnapshot.length - 1] = { ...last, text, interim: false };
          } else {
            linesSnapshot.push({ id: nextLineId++, speaker, text });
          }
        } else {
          if (last && last.speaker === speaker && last.interim) {
            linesSnapshot[linesSnapshot.length - 1] = { ...last, text };
          } else {
            linesSnapshot.push({ id: nextLineId++, speaker, text, interim: true });
          }
        }

        queueFlush();
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
        const toSave = linesSnapshot
          .filter((l) => !l.interim)
          .map((l) => ({ speaker: l.speaker, text: l.text }));

        // Final incremental save (forces summary + embed)
        if (toSave.length > savedLineCountRef.current) {
          turnsSinceLastSummaryRef.current = 99; // force summary on final save
          scheduleIncrementalSave(toSave, [...metricsSnapshot]);
        }

        onTranscriptRef.current?.(toSave);
        if (metricsSnapshot.length > 0) {
          onMetricsRef.current?.(metricsSnapshot);
        }
        onLeaveRef.current?.();
      });

      // ── Join the room ───────────────────────────────────────────────
      call.join({ url: roomUrl, token })
        .then(() => {
          setStatus("Connected - listening to the conversation");
          // Ensure the browser receives transcription events.  The agent
          // (goes_first) normally starts Deepgram transcription, but
          // calling startTranscription from the browser side as well
          // guarantees the local call object is subscribed.  Settings
          // must match the agent's config to avoid restarting with
          // different params.  If transcription is already running
          // Daily throws a harmless error we catch below.
          try {
            call.startTranscription({
              model: "nova-2-general",
              includeRawResponse: true,
              extra: { interim_results: true },
            });
            console.debug("[CallProvider] startTranscription succeeded");
          } catch (err: any) {
            console.debug(
              "[CallProvider] startTranscription (expected if already active):",
              err?.message || err,
            );
          }
        })
        .catch((err) => setStatus(`Error: ${err.message}`));
    });

    // ── Cleanup on unmount or dependency change ─────────────────────────
    return () => {
      destroyedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Close WebSocket relay if open
      const ws = (containerRef as any)._ws;
      if (ws) {
        (containerRef as any)._ws = null;
        ws.close();
      }
      // Tear down Daily call
      const call = (containerRef as any)._call;
      if (call) {
        (containerRef as any)._call = null;
        call.leave().then(() => call.destroy()).catch(() => call.destroy());
      }
    };
    // Only re-run when the room or token change — callback refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token]);

  // ── Derived live latency data ────────────────────────────────────────
  // Show only the latest turn per agent (not averages)
  const latestByAgent: Record<string, TurnMetric> = {};
  for (const m of liveMetrics) {
    latestByAgent[m.agent] = m; // last one wins
  }
  const uniqueAgents = Object.keys(latestByAgent);

  function latencyColor(ms: number): string {
    if (ms < 500) return "text-emerald-400";
    if (ms < 1000) return "text-amber-400";
    return "text-red-400";
  }

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

      {/* Room link + mute toggle */}
      <div className="flex items-center gap-3">
        <a
          href={roomUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setMuted(true)}
          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Daily Room <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => setMuted((m) => !m)}
          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
            muted
              ? "text-amber-400 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20"
              : "text-muted border-border hover:bg-surface-elevated"
          }`}
          title={muted ? "Unmute app audio" : "Mute app audio (use Daily Room tab instead)"}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {muted ? "Muted" : "Audio On"}
        </button>
      </div>

      {/* Live latency stats */}
      {liveMetrics.length > 0 && (
        <div className="w-full rounded-xl bg-surface-elevated border border-border p-4 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Live Latency
          </h3>
          <div className="space-y-2">
            {uniqueAgents.map((agent) => {
              const m = latestByAgent[agent];
              const turnCount = liveMetrics.filter((t) => t.agent === agent).length;
              return (
                <div key={agent} className="flex items-center gap-4 text-xs">
                  <span className="font-semibold text-foreground w-16 shrink-0 truncate">{agent}</span>
                  <div className="flex gap-4">
                    {m.ttfb != null && (
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] uppercase tracking-wider text-muted">TTFB</span>
                        <span className={`font-mono font-medium ${latencyColor(m.ttfb)}`}>{m.ttfb}ms</span>
                      </div>
                    )}
                    {m.llm != null && (
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] uppercase tracking-wider text-muted">LLM</span>
                        <span className={`font-mono font-medium ${latencyColor(m.llm)}`}>{m.llm}ms</span>
                      </div>
                    )}
                    {m.tts != null && (
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] uppercase tracking-wider text-muted">TTS</span>
                        <span className={`font-mono font-medium ${latencyColor(m.tts)}`}>{m.tts}ms</span>
                      </div>
                    )}
                    {m.e2e != null && (
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] uppercase tracking-wider text-muted">E2E</span>
                        <span className={`font-mono font-medium ${latencyColor(m.e2e)}`}>{m.e2e}ms</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted ml-auto">turn {m.turn ?? turnCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live summary */}
      {liveSummary && (
        <div className="w-full rounded-xl bg-surface-elevated border border-border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Live Summary
            </h3>
            {liveOutcome && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border border-border ${
                liveOutcome === "excellent" || liveOutcome === "good"
                  ? "text-emerald-400 bg-emerald-400/10"
                  : liveOutcome === "average"
                    ? "text-amber-400 bg-amber-400/10"
                    : "text-red-400 bg-red-400/10"
              }`}>
                {liveOutcome.replace("_", " ")}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{liveSummary}</p>
        </div>
      )}

      {/* Live transcript feed */}
      <Transcript lines={lines} agentNames={agentNames} />

      {/* Connection status indicator */}
      <p className="text-xs text-muted/60 font-mono">{status}</p>
    </div>
  );
}
