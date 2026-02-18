import prisma from "@/lib/prisma";
import type { Session, Conversation } from "@/generated/prisma/client";
import Link from "next/link";
import SessionRow from "@/components/SessionRow";

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
    const convLm = (conv?.latencyMetrics as any[] | null) ?? [];
    const cmTtfb = convLm.map((m: any) => m.ttfb).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmLlm = convLm.map((m: any) => m.llm).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmTts = convLm.map((m: any) => m.tts).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmE2e = convLm.map((m: any) => m.e2e).filter((v: any): v is number => typeof v === "number" && v > 0);

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
    const lm = (c.latencyMetrics as any[] | null) ?? [];
    const lines = (c.lines as any[] | null) ?? [];
    const cmTtfb = lm.map((m: any) => m.ttfb).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmLlm = lm.map((m: any) => m.llm).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmTts = lm.map((m: any) => m.tts).filter((v: any): v is number => typeof v === "number" && v > 0);
    const cmE2e = lm.map((m: any) => m.e2e).filter((v: any): v is number => typeof v === "number" && v > 0);

    sessionData.push({
      id: c.id,
      roomName: c.title,
      roomUrl: c.roomUrl || "",
      agentNames: c.agentNames as string[],
      ttfb: avg(cmTtfb),
      llm: avg(cmLlm),
      tts: avg(cmTts),
      e2e: avg(cmE2e),
      turns: lm.length > 0 ? lm.length : lines.length,
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
