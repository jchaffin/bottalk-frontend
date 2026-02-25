"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DailyCall,
  DailyParticipant,
  DailyEventObjectAppMessage,
  DailyEventObjectTranscriptionError,
  DailyEventObjectTranscriptionMessage,
  DailyEventObjectTranscriptionStarted,
} from "@daily-co/daily-js";
import AgentAvatar from "./AgentAvatar";
import Transcript from "./Transcript";
import type { TranscriptLine } from "@/lib/api";
import { DEFAULT_AGENT_COLORS, APP_MESSAGE_LABEL } from "@/lib/config";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeSentiment(v: unknown): "positive" | "neutral" | "negative" {
  return v === "positive" || v === "negative" || v === "neutral" ? v : "neutral";
}

function parseTurnAnnotations(v: unknown): TranscriptLine["annotation"][] {
  if (!Array.isArray(v)) return [];
  return v.map((a) => {
    const r = isRecord(a) ? a : {};
    const label = typeof r.label === "string" ? r.label : "";
    const rawRole = typeof r.role === "string" ? r.role : undefined;
    const role = rawRole === "agent" || rawRole === "user" ? rawRole : undefined;
    const relevantKpis = Array.isArray(r.relevantKpis)
      ? r.relevantKpis.filter((k): k is string => typeof k === "string")
      : [];
    return {
      role,
      label,
      sentiment: normalizeSentiment(r.sentiment),
      relevantKpis,
    };
  });
}

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

type MetricKey = "ttfb" | "llm" | "tts" | "e2e";

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
 * @property onCallEnded  - Fired when classification detects call ended (stops backend, navigates).
 */
interface CallProviderProps {
  roomUrl: string;
  token: string;
  agentSessions?: string[];
  agentNames: [string, string];
  agentColors?: [string, string];
  /** Title for the conversation record (used when auto-saving). */
  title?: string;
  onTranscript?: (lines: { speaker: string; text: string }[]) => void;
  onMetrics?: (metrics: TurnMetric[]) => void;
  onLeave?: () => void;
  onCallEnded?: () => void | Promise<void>;
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
  agentSessions,
  agentNames,
  agentColors = DEFAULT_AGENT_COLORS,
  title,
  onTranscript,
  onMetrics,
  onLeave,
  onCallEnded,
}: CallProviderProps) {
  // ── React state ──────────────────────────────────────────────────────
  const [status, setStatus] = useState("Connecting...");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [liveMetrics, setLiveMetrics] = useState<TurnMetric[]>([]);
  /** Live summary generated during the call. */
  const [liveSummary, setLiveSummary] = useState<string | null>(null);
  /** Live KPI outcome from incremental classification. */
  const [liveOutcome, setLiveOutcome] = useState<string | null>(null);
  /** Turn annotations from real-time classification, applied to transcript lines. */
  const [annotations, setAnnotations] = useState<TranscriptLine["annotation"][]>([]);

  // ── Refs ──────────────────────────────────────────────────────────────
  /** Hidden DOM node that hosts dynamically-created <audio> elements. */
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Guard flag set to `true` during cleanup so the async Daily import
   * callback can bail out if the component unmounted before it resolved.
   */
  const destroyedRef = useRef(false);
  /** Daily call object for this session. */
  const callRef = useRef<DailyCall | null>(null);
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
  const onCallEndedRef = useRef(onCallEnded);
  onCallEndedRef.current = onCallEnded;
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
  /** Prevent firing onCallEnded more than once when classification returns callEnded. */
  const callEndedTriggeredRef = useRef(false);

  const agentNameSet = useRef(new Set(agentNames));
  agentNameSet.current = new Set(agentNames);

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
            if (isRecord(data) && typeof data.outcome === "string") setLiveOutcome(data.outcome);
            // Apply turn annotations from classification
            if (isRecord(data)) {
              const kpiScores = isRecord(data.kpiScores) ? data.kpiScores : null;
              const ann = parseTurnAnnotations(kpiScores?.turnAnnotations);
              if (ann.length > 0) setAnnotations(ann);
            }
            // Classification detected call ended — stop backend and leave
            if (
              isRecord(data) &&
              data.callEnded === true &&
              !callEndedTriggeredRef.current
            ) {
              callEndedTriggeredRef.current = true;
              setStatus("Disconnected");
              onTranscriptRef.current?.(currentLines);
              if (currentMetrics.length > 0) onMetricsRef.current?.(currentMetrics);
              await onCallEndedRef.current?.();
            }
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
      if (callRef.current) return;
      const DailyIframe = mod.default;

      // Create an audio-only call object — no local mic or camera.
      const call = DailyIframe.createCallObject({
        audioSource: false,   // don't request microphone
        videoSource: false,   // don't request camera
        subscribeToTracksAutomatically: true, // auto-subscribe to remote tracks
      });
      // Stash the call on the ref so cleanup and guard checks can access it.
      callRef.current = call;

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
        el.muted = false;
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
        for (const [k, p] of Object.entries(all) as Array<[string, DailyParticipant]>) {
          if (k === "local") continue;
          if (p.user_name) {
            // Map by participantId (key), session_id, and user_id for robust lookups.
            participantsRef.current[k] = p.user_name;
            participantsRef.current[p.session_id] = p.user_name;
            participantsRef.current[p.user_id] = p.user_name;
          }
        }
        console.debug("[CallProvider] joined, participants:", { ...participantsRef.current });
        setStatus("Listening...");
      });

      call.on("transcription-started", (ev: DailyEventObjectTranscriptionStarted) => {
        console.debug("[CallProvider] transcription-started", ev);
      });

      call.on("transcription-error", (ev: DailyEventObjectTranscriptionError) => {
        console.error("[CallProvider] transcription-error", ev);
      });

      // ── App-message metrics (agent → browser via Daily) ────────────
      // Single source of truth for transcript text + latency metrics.
      // Agents broadcast via Daily REST API send-app-message with retries.
      // Late-joining browsers receive a replayed history burst on connect.
      call.on("app-message", (ev: DailyEventObjectAppMessage<unknown>) => {
        if (!ev?.data) return;
        try {
          const raw = typeof ev.data === "string" ? (JSON.parse(ev.data) as unknown) : ev.data;
          if (!isRecord(raw)) return;
          if (raw.label !== APP_MESSAGE_LABEL) return;

          const agent = typeof raw.agent === "string" ? raw.agent : "Unknown";
          const type = typeof raw.type === "string" ? raw.type : "";
          const value = typeof raw.value === "number" ? raw.value : 0;
          const processor = typeof raw.processor === "string" ? raw.processor.toLowerCase() : "";

          function applyMetric(key: MetricKey, ms: number) {
            if (!pendingMetrics[agent]) pendingMetrics[agent] = { agent };
            pendingMetrics[agent][key] = ms;

            for (let i = linesSnapshot.length - 1; i >= 0; i--) {
              if (linesSnapshot[i].speaker === agent && linesSnapshot[i].metrics) {
                linesSnapshot[i] = {
                  ...linesSnapshot[i],
                  metrics: { ...linesSnapshot[i].metrics, [key]: ms },
                };
                queueFlush();
                break;
              }
            }
            for (let i = metricsSnapshot.length - 1; i >= 0; i--) {
              if (metricsSnapshot[i].agent === agent) {
                metricsSnapshot[i] = { ...metricsSnapshot[i], [key]: ms };
                setLiveMetrics([...metricsSnapshot]);
                break;
              }
            }
          }

          if (type === "ttfb") {
            if (value <= 0) return;
            const isTts =
              processor.includes("tts") ||
              processor.includes("elevenlabs") ||
              processor.includes("cartesia");
            applyMetric(isTts ? "tts" : "ttfb", Math.round(value * 1000));
          } else if (type === "processing") {
            if (value <= 0) return;
            const isTts =
              processor.includes("tts") ||
              processor.includes("elevenlabs") ||
              processor.includes("cartesia");
            if (!isTts) applyMetric("llm", Math.round(value * 1000));
          } else if (type === "e2e") {
            if (value <= 0) return;
            applyMetric("e2e", Math.round(value * 1000));
          } else if (type === "interruption") {
            // Mark the most recent bot line as interrupted
            for (let i = linesSnapshot.length - 1; i >= 0; i--) {
              if (linesSnapshot[i].speaker === agent && !linesSnapshot[i].interim) {
                linesSnapshot[i] = { ...linesSnapshot[i], interrupted: true };
                queueFlush();
                break;
              }
            }
          } else if (type === "turn") {
            const turnNum = typeof raw.turn === "number" ? raw.turn : -1;
            const turnKey = `${agent}:${turnNum}`;
            if (seenTurns.has(turnKey)) return;
            seenTurns.add(turnKey);

            const text = typeof raw.output === "string" ? raw.output : "";
            const pending = pendingMetrics[agent] || { agent };
            if (typeof raw.e2e === "number" && pending.e2e == null) {
              pending.e2e = Math.round(raw.e2e * 1000);
            }
            const metric: TurnMetric = {
              ...pending,
              agent,
              turn: turnNum >= 0 ? turnNum : metricsSnapshot.filter((m) => m.agent === agent).length + 1,
              ts: typeof raw.ts === "number" ? raw.ts : undefined,
            };
            metricsSnapshot.push(metric);
            setLiveMetrics([...metricsSnapshot]);
            delete pendingMetrics[agent];

            // Attach metrics to the most recent unannotated line for this agent.
            // If no line exists yet, buffer — applied when the next Deepgram line appears.
            const metricsObj = { ttfb: metric.ttfb, llm: metric.llm, tts: metric.tts, e2e: metric.e2e };
            let applied = false;
            for (let i = linesSnapshot.length - 1; i >= 0; i--) {
              if (linesSnapshot[i].speaker === agent && !linesSnapshot[i].interim && !linesSnapshot[i].metrics) {
                linesSnapshot[i] = { ...linesSnapshot[i], metrics: metricsObj };
                queueFlush();
                applied = true;
                break;
              }
            }
            if (!applied) {
              pendingLineMetrics[agent] = metricsObj;
            }

            // Skip transcript injection — Deepgram is the source of truth.
            // Injecting from app-message caused duplicates when both
            // Deepgram and the turn event delivered the same text.
          }
        } catch { /* ignore malformed app-messages */ }
      });

      /**
       * "participant-joined" — a new remote participant enters the room.
       * Record their session_id and user_id → name mappings.
       */
      call.on("participant-joined", (ev) => {
        if (!ev) return;
        if (ev.participant.user_name) {
          participantsRef.current[ev.participant.session_id] = ev.participant.user_name;
          participantsRef.current[ev.participant.user_id] = ev.participant.user_name;
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

      function mergeConsecutiveSpeakers(
        rawLines: { speaker: string; text: string }[],
      ): { speaker: string; text: string }[] {
        const out: { speaker: string; text: string }[] = [];
        for (const line of rawLines) {
          const last = out.length > 0 ? out[out.length - 1] : null;
          if (last && last.speaker === line.speaker) {
            out[out.length - 1] = { ...last, text: last.text + " " + line.text };
          } else {
            out.push({ ...line });
          }
        }
        return out;
      }

      function queueFlush() {
        if (flushQueued) return;
        flushQueued = true;
        requestAnimationFrame(() => {
          flushQueued = false;
          const merged: TranscriptLine[] = [];
          for (const line of linesSnapshot) {
            const last = merged.length > 0 ? merged[merged.length - 1] : null;
            if (last && last.speaker === line.speaker) {
              if (line.interim) {
                // Fold interim into preceding line from same speaker
                merged[merged.length - 1] = {
                  ...last,
                  text: last.text + " " + line.text,
                  interim: true,
                };
              } else if (!last.interim) {
                // Merge consecutive finals from same speaker
                merged[merged.length - 1] = {
                  ...last,
                  text: last.text + " " + line.text,
                  metrics: line.metrics || last.metrics,
                };
              } else {
                // Last was interim, this is final — replace
                merged[merged.length - 1] = {
                  ...last,
                  text: last.text.replace(/\s+\S+$/, "") + " " + line.text,
                  interim: false,
                  metrics: line.metrics || last.metrics,
                };
              }
            } else {
              merged.push(line);
            }
          }
          setLines(merged.slice(-MAX_VISIBLE));
        });
      }

      const metricsSnapshot: TurnMetric[] = [];
      const pendingMetrics: Record<string, TurnMetric> = {};
      const pendingLineMetrics: Record<string, TranscriptLine["metrics"]> = {};
      const seenTurns = new Set<string>();

      // ── Deepgram transcription (primary transcript source) ──────────
      call.on("transcription-message", (msg: DailyEventObjectTranscriptionMessage) => {
        if (!msg) return;
        const text = msg.text;
        if (!text) return;
        const isFinal = msg.rawResponse?.is_final ?? true;
        const participantId = msg.participantId || "";
        let speaker = participantsRef.current[participantId];
        if (!speaker && participantId) {
          const p = call.participants()[participantId];
          if (p?.user_name) {
            participantsRef.current[participantId] = p.user_name;
            participantsRef.current[p.session_id] = p.user_name;
            if (p.user_id) participantsRef.current[p.user_id] = p.user_name;
            speaker = p.user_name;
          }
        }
        speaker = speaker || "Unknown";

        const last = linesSnapshot.length > 0 ? linesSnapshot[linesSnapshot.length - 1] : null;
        if (isFinal) {
          if (last && last.speaker === speaker && last.interim) {
            linesSnapshot[linesSnapshot.length - 1] = { ...last, text, interim: false };
          } else if (last && last.speaker === speaker && !last.interim) {
            linesSnapshot[linesSnapshot.length - 1] = { ...last, text: last.text + " " + text };
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

        // Apply any buffered metrics that arrived before this line existed
        if (isFinal && pendingLineMetrics[speaker]) {
          const last = linesSnapshot[linesSnapshot.length - 1];
          if (last && last.speaker === speaker && !last.metrics) {
            linesSnapshot[linesSnapshot.length - 1] = {
              ...last,
              metrics: pendingLineMetrics[speaker],
            };
          }
          delete pendingLineMetrics[speaker];
        }

        queueFlush();

        const cleanLines = mergeConsecutiveSpeakers(
          linesSnapshot
            .filter((l) => !l.interim)
            .map((l) => ({ speaker: l.speaker, text: l.text })),
        );
        scheduleIncrementalSave(cleanLines, [...metricsSnapshot]);
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
        const toSave = mergeConsecutiveSpeakers(
          linesSnapshot
            .filter((l) => !l.interim)
            .map((l) => ({ speaker: l.speaker, text: l.text })),
        );

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
        .then(async () => {
          console.log("[CallProvider] joined room, ensuring transcription...");
          setStatus("Connected - listening to the conversation");

          const startOptions = {
            model: "nova-2-general",
            includeRawResponse: true,
            extra: { interim_results: true },
          } as const;

          let started = false;
          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              await call.startTranscription(startOptions);
              started = true;
              console.log("[CallProvider] startTranscription succeeded");
              break;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              // "already active" is effectively success.
              if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("in progress")) {
                started = true;
                console.log("[CallProvider] transcription already active");
                break;
              }
              console.warn(`[CallProvider] startTranscription retry ${attempt}/4 failed:`, msg);
              if (attempt < 4) {
                await new Promise((r) => setTimeout(r, 350));
              }
            }
          }

          if (!started) {
            console.error("[CallProvider] unable to start transcription after retries");
          }
        })
        .catch((err) => {
          console.error("[CallProvider] join failed:", err);
          setStatus(`Error: ${err.message}`);
        });
    });

    // ── Cleanup on unmount or dependency change ─────────────────────────
    return () => {
      destroyedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const call = callRef.current;
      if (call) {
        callRef.current = null;
        call.leave().then(() => call.destroy()).catch(() => call.destroy());
      }
    };
    // Only re-run when the room or token change — callback refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token]);

  // ── Derived aggregate latency ──────────────────────────────────────
  function avgOf(key: keyof TurnMetric): number | null {
    const vals = liveMetrics
      .map((m) => m[key])
      .filter((v): v is number => typeof v === "number" && v > 0);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  const aggTtfb = avgOf("ttfb");
  const aggLlm = avgOf("llm");
  const aggTts = avgOf("tts");
  const aggE2e = avgOf("e2e");
  const totalTurns = liveMetrics.length;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Hidden container for dynamically-created <audio> elements */}
      <div ref={containerRef} className="hidden" />

      {/* Agent avatars with speaking-pulse indicators */}
      <div className="flex flex-wrap justify-center gap-6 sm:gap-16">
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

      {/* Aggregate latency stats */}
      {totalTurns > 0 && (
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg TTFB", value: aggTtfb, color: "#686EFF" },
            { label: "Avg LLM", value: aggLlm, color: "#22c55e" },
            { label: "Avg TTS", value: aggTts, color: "#f59e0b" },
            { label: "Avg E2E", value: aggE2e, color: "#ef4444" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-surface-elevated border border-border p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{m.label}</p>
              <p
                className="text-lg font-bold font-mono"
                style={{ color: m.value != null ? m.color : undefined }}
              >
                {m.value != null ? `${m.value}ms` : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      <a
        href={roomUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent hover:text-accent-hover transition-colors"
      >
        Daily Room
      </a>

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

      {/* Live transcript feed — merge annotations from classification */}
      <Transcript
        lines={annotations.length > 0
          ? lines.map((line, idx) => {
              const nonInterimIdx = lines.slice(0, idx + 1).filter((l) => !l.interim).length - 1;
              const ann = annotations[nonInterimIdx];
              if (!ann || line.interim) return line;
              // Derive role from speaker — agentNames[0] = agent being evaluated, [1] = user
              const role = line.speaker === agentNames[0] ? "agent" : "user";
              return { ...line, annotation: { ...ann, role } };
            })
          : lines
        }
        agentNames={agentNames}
      />

    </div>
  );
}
