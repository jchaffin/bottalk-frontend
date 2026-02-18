import prisma from "@/lib/prisma";
import type { Session, Conversation } from "@/generated/prisma/client";
import Link from "next/link";
import SessionRow from "@/components/SessionRow";

type LatencyMetricPoint = {
  ttfb?: number;
  llm?: number;
  tts?: number;
  e2e?: number;
};

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseLatencyMetricPoint(v: unknown): LatencyMetricPoint | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    ttfb: asFiniteNumber(r.ttfb),
    llm: asFiniteNumber(r.llm),
    tts: asFiniteNumber(r.tts),
    e2e: asFiniteNumber(r.e2e),
  };
}

interface SessionData {
  id: string;
  roomName: string;
  roomUrl: string;
  agentNames: string[];
  ttfb: number | null;
  llm: number | null;
  tts: number | null;
  e2e: number | null;
  turns: number;
  conversationId: string | null;
  createdAt: string;
}

export default async function SessionsPage() {
  const [sessions, metrics, conversations] = await Promise.all([
    prisma.session.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.sessionMetric.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.conversation.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  // Build SessionMetric-based aggregates
  const metricsBySession = new Map<
    string,
    { ttfb: number[]; llm: number[]; tts: number[]; e2e: number[]; agents: Set<string> }
  >();
  for (const m of metrics) {
    if (!metricsBySession.has(m.sessionId)) {
      metricsBySession.set(m.sessionId, { ttfb: [], llm: [], tts: [], e2e: [], agents: new Set() });
    }
    const entry = metricsBySession.get(m.sessionId)!;
    entry.agents.add(m.agentName);
    if (m.ttfb !== null && m.ttfb > 0) entry.ttfb.push(m.ttfb);
    if (m.llmDuration !== null && m.llmDuration > 0) entry.llm.push(m.llmDuration);
    if (m.ttsDuration !== null && m.ttsDuration > 0) entry.tts.push(m.ttsDuration);
    if (m.e2eLatency !== null && m.e2eLatency > 0) entry.e2e.push(m.e2eLatency);
  }

  // Build a lookup: roomUrl → conversation (to pull latencyMetrics JSON)
  const convByRoom = new Map<string, Conversation>();
  for (const c of conversations) {
    if (c.roomUrl) convByRoom.set(c.roomUrl, c);
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  // Build session data from the Session table where available
  const sessionData: SessionData[] = sessions.map((s: Session) => {
    const sm = metricsBySession.get(s.id);
    const conv = convByRoom.get(s.roomUrl);
    const convLmRaw = conv?.latencyMetrics;
    const convLm = Array.isArray(convLmRaw)
      ? convLmRaw
          .map(parseLatencyMetricPoint)
          .filter((m): m is LatencyMetricPoint => m != null)
      : [];
    const cmTtfb = convLm.map((m) => m.ttfb).filter((v): v is number => typeof v === "number" && v > 0);
    const cmLlm = convLm.map((m) => m.llm).filter((v): v is number => typeof v === "number" && v > 0);
    const cmTts = convLm.map((m) => m.tts).filter((v): v is number => typeof v === "number" && v > 0);
    const cmE2e = convLm.map((m) => m.e2e).filter((v): v is number => typeof v === "number" && v > 0);

    return {
      id: s.id,
      roomName: s.roomName,
      roomUrl: s.roomUrl,
      agentNames: conv ? (conv.agentNames as string[]) : sm ? [...sm.agents] : [`${s.agentSessions.length} agents`],
      ttfb: avg(cmTtfb.length > 0 ? cmTtfb : sm?.ttfb ?? []),
      llm: avg(cmLlm.length > 0 ? cmLlm : sm?.llm ?? []),
      tts: avg(cmTts.length > 0 ? cmTts : sm?.tts ?? []),
      e2e: avg(cmE2e.length > 0 ? cmE2e : sm?.e2e ?? []),
      turns: convLm.length > 0 ? convLm.length : (sm ? Math.max(sm.ttfb.length, sm.llm.length) : 0),
      conversationId: conv?.id ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  });

  // Also build session cards from conversations that have no matching Session record
  const sessionRoomUrls = new Set(sessions.map((s: Session) => s.roomUrl));
  for (const c of conversations) {
    if (c.roomUrl && sessionRoomUrls.has(c.roomUrl)) continue;
    const lmRaw = c.latencyMetrics;
    const lm = Array.isArray(lmRaw)
      ? lmRaw
          .map(parseLatencyMetricPoint)
          .filter((m): m is LatencyMetricPoint => m != null)
      : [];
    const lineCount = Array.isArray(c.lines) ? (c.lines as unknown[]).length : 0;
    const cmTtfb = lm.map((m) => m.ttfb).filter((v): v is number => typeof v === "number" && v > 0);
    const cmLlm = lm.map((m) => m.llm).filter((v): v is number => typeof v === "number" && v > 0);
    const cmTts = lm.map((m) => m.tts).filter((v): v is number => typeof v === "number" && v > 0);
    const cmE2e = lm.map((m) => m.e2e).filter((v): v is number => typeof v === "number" && v > 0);

    sessionData.push({
      id: c.id,
      roomName: c.title,
      roomUrl: c.roomUrl || "",
      agentNames: c.agentNames as string[],
      ttfb: avg(cmTtfb),
      llm: avg(cmLlm),
      tts: avg(cmTts),
      e2e: avg(cmE2e),
      turns: lm.length > 0 ? lm.length : lineCount,
      conversationId: c.id,
      createdAt: c.createdAt.toISOString(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
        <p className="text-sm text-muted mt-1">
          Active and recent Pipecat Cloud sessions with per-session latency metrics.
        </p>
      </div>

      {sessionData.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">No sessions recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessionData.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}

      <div className="text-center">
        <Link href="/" className="text-xs text-accent hover:text-accent-hover">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
