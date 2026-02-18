import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { SessionMetric, Conversation } from "@/generated/prisma/client";

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

/**
 * GET /api/dashboard — Consolidated dashboard data.
 * Returns latency aggregates, KPI summaries, and recent sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawDays = parseInt(searchParams.get("days") || "7", 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 7;

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch only the data we need. Avoid loading full transcript `lines`
    // for every conversation (that can get huge and cause timeouts).
    const [metrics, conversationsMeta, recentConversationsRaw, totalSessions] = await Promise.all([
      prisma.sessionMetric.findMany({
        where: { createdAt: { gte: since } },
        select: {
          createdAt: true,
          ttfb: true,
          llmDuration: true,
          ttsDuration: true,
          e2eLatency: true,
          userBotLatency: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.conversation.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          title: true,
          agentNames: true,
          outcome: true,
          kpiScores: true,
          latencyMetrics: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.conversation.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          title: true,
          agentNames: true,
          outcome: true,
          kpiScores: true,
          lines: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.session.count(),
    ]);

    // Prisma + JSON fields can lose type precision under some build setups.
    // Re-assert the shapes we rely on to avoid implicit-any lint errors.
    type MetricRow = Pick<
      SessionMetric,
      "createdAt" | "ttfb" | "llmDuration" | "ttsDuration" | "e2eLatency" | "userBotLatency"
    >;
    const metricRows = metrics as MetricRow[];
    const conversationRows = conversationsMeta as Array<
      Pick<
        Conversation,
        "id" | "title" | "agentNames" | "outcome" | "kpiScores" | "latencyMetrics" | "createdAt"
      >
    >;

    // Latency aggregates — merge SessionMetric table data with
    // per-conversation latencyMetrics JSON (the WebSocket-collected data)
    const valid = (arr: (number | null | undefined)[]) =>
      arr.filter((v): v is number => typeof v === "number" && v > 0);
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    // Source 1: SessionMetric table (from agent webhook)
    const smTtfb = valid(metricRows.map((m) => m.ttfb));
    const smLlm = valid(metricRows.map((m) => m.llmDuration));
    const smTts = valid(metricRows.map((m) => m.ttsDuration));
    const smE2e = valid(metricRows.map((m) => m.e2eLatency));
    const ublValues = valid(metricRows.map((m) => m.userBotLatency));

    // Source 2: conversation.latencyMetrics JSON (from WebSocket relay)
    const convMetrics: LatencyMetricPoint[] = conversationRows.flatMap((c) => {
      const lm = c.latencyMetrics;
      if (!Array.isArray(lm)) return [];
      return lm
        .map(parseLatencyMetricPoint)
        .filter((m): m is LatencyMetricPoint => m != null);
    });
    const cmTtfb = valid(convMetrics.map((m) => m.ttfb));
    const cmLlm = valid(convMetrics.map((m) => m.llm));
    const cmTts = valid(convMetrics.map((m) => m.tts));
    const cmE2e = valid(convMetrics.map((m) => m.e2e));

    // Prefer conversation-level metrics (more complete), fall back to SessionMetric
    const ttfbValues = cmTtfb.length > 0 ? cmTtfb : smTtfb;
    const llmValues = cmLlm.length > 0 ? cmLlm : smLlm;
    const ttsValues = cmTts.length > 0 ? cmTts : smTts;
    const e2eValues = cmE2e.length > 0 ? cmE2e : smE2e;

    // KPI aggregates from classified conversations
    const classified = conversationRows.filter((c) => c.kpiScores);
    const kpiAverages: Record<string, number | null> = {};
    if (classified.length > 0) {
      const keys = ["discovery", "objectionHandling", "valueArticulation", "turnTaking", "responseRelevance", "nextSteps"];
      for (const key of keys) {
        const vals = classified
          .map((c: Pick<Conversation, "kpiScores">) => (c.kpiScores as Record<string, number>)?.[key])
          .filter((v: number | undefined): v is number => typeof v === "number");
        kpiAverages[key] = avg(vals);
      }
    }

    // Outcome distribution
    const outcomeCounts: Record<string, number> = {};
    for (const c of classified) {
      const outcome = c.outcome || "unclassified";
      outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
    }

    // Latency timeseries (grouped by hour for chart)
    // Merge both SessionMetric table and conversation-level latencyMetrics
    const hourlyLatency: Record<
      string,
      { ttfb: number[]; llm: number[]; tts: number[]; e2e: number[]; ubl: number[] }
    > = {};

    function addToHour(hour: string, ttfb?: number | null, llm?: number | null, tts?: number | null, e2e?: number | null, ubl?: number | null) {
      if (!hourlyLatency[hour]) {
        hourlyLatency[hour] = { ttfb: [], llm: [], tts: [], e2e: [], ubl: [] };
      }
      if (ttfb != null && ttfb > 0) hourlyLatency[hour].ttfb.push(ttfb);
      if (llm != null && llm > 0) hourlyLatency[hour].llm.push(llm);
      if (tts != null && tts > 0) hourlyLatency[hour].tts.push(tts);
      if (e2e != null && e2e > 0) hourlyLatency[hour].e2e.push(e2e);
      if (ubl != null && ubl > 0) hourlyLatency[hour].ubl.push(ubl);
    }

    for (const m of metricRows) {
      const hour = new Date(m.createdAt).toISOString().slice(0, 13) + ":00:00Z";
      addToHour(hour, m.ttfb, m.llmDuration, m.ttsDuration, m.e2eLatency, m.userBotLatency);
    }

    // Add conversation-level latency metrics into the timeseries
    for (const c of conversationRows) {
      const lm = c.latencyMetrics;
      if (!Array.isArray(lm)) continue;
      const hour = new Date(c.createdAt).toISOString().slice(0, 13) + ":00:00Z";
      for (const raw of lm as unknown[]) {
        const m = parseLatencyMetricPoint(raw);
        if (!m) continue;
        addToHour(hour, m.ttfb, m.llm, m.tts, m.e2e);
      }
    }

    const latencyTimeseries = Object.entries(hourlyLatency)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, vals]) => ({
        time: hour,
        ttfb: avg(vals.ttfb),
        llm: avg(vals.llm),
        tts: avg(vals.tts),
        e2e: avg(vals.e2e),
        userBotLatency: avg(vals.ubl),
      }));

    // Recent conversations (last 10)
    type RecentConversationRow = Pick<
      Conversation,
      "id" | "title" | "agentNames" | "outcome" | "kpiScores" | "createdAt"
    > & { lines: unknown };
    const recentRows = recentConversationsRaw as RecentConversationRow[];
    const recentConversations = recentRows.map((c) => ({
      id: c.id,
      title: c.title,
      agentNames: c.agentNames,
      outcome: c.outcome,
      kpiScores: c.kpiScores,
      lineCount: Array.isArray(c.lines) ? c.lines.length : 0,
      createdAt: new Date(c.createdAt).toISOString(),
    }));

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      summary: {
        totalSessions,
        totalConversations: conversationsMeta.length,
        totalMetricPoints: metrics.length + convMetrics.length,
        classifiedCount: classified.length,
      },
      latency: {
        ttfb: avg(ttfbValues),
        llm: avg(llmValues),
        tts: avg(ttsValues),
        e2e: avg(e2eValues),
        userBotLatency: avg(ublValues),
      },
      kpiAverages,
      outcomeCounts,
      latencyTimeseries,
      recentConversations,
    });
  } catch (err) {
    console.error("GET /api/dashboard error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
