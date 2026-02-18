import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { SessionMetric, Conversation } from "@/generated/prisma/client";

/**
 * GET /api/dashboard — Consolidated dashboard data.
 * Returns latency aggregates, KPI summaries, and recent sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch metrics and conversations in parallel
    const [metrics, conversations, totalSessions] = await Promise.all([
      prisma.sessionMetric.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.conversation.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.session.count(),
    ]);

    // Latency aggregates — merge SessionMetric table data with
    // per-conversation latencyMetrics JSON (the WebSocket-collected data)
    const valid = (arr: (number | null | undefined)[]) =>
      arr.filter((v): v is number => typeof v === "number" && v > 0);
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    // Source 1: SessionMetric table (from agent webhook)
    const smTtfb = valid(metrics.map((m: SessionMetric) => m.ttfb));
    const smLlm = valid(metrics.map((m: SessionMetric) => m.llmDuration));
    const smTts = valid(metrics.map((m: SessionMetric) => m.ttsDuration));
    const smE2e = valid(metrics.map((m: SessionMetric) => m.e2eLatency));
    const ublValues = valid(metrics.map((m: SessionMetric) => m.userBotLatency));

    // Source 2: conversation.latencyMetrics JSON (from WebSocket relay)
    const convMetrics = conversations.flatMap((c: Conversation) => {
      const lm = c.latencyMetrics as any[] | null;
      return Array.isArray(lm) ? lm : [];
    });
    const cmTtfb = valid(convMetrics.map((m: any) => m.ttfb));
    const cmLlm = valid(convMetrics.map((m: any) => m.llm));
    const cmTts = valid(convMetrics.map((m: any) => m.tts));
    const cmE2e = valid(convMetrics.map((m: any) => m.e2e));

    // Prefer conversation-level metrics (more complete), fall back to SessionMetric
    const ttfbValues = cmTtfb.length > 0 ? cmTtfb : smTtfb;
    const llmValues = cmLlm.length > 0 ? cmLlm : smLlm;
    const ttsValues = cmTts.length > 0 ? cmTts : smTts;
    const e2eValues = cmE2e.length > 0 ? cmE2e : smE2e;

    // KPI aggregates from classified conversations
    const classified = conversations.filter((c: Conversation) => c.kpiScores);
    const kpiAverages: Record<string, number | null> = {};
    if (classified.length > 0) {
      const keys = ["resolution", "sentiment", "efficiency", "professionalism", "goalCompletion"];
      for (const key of keys) {
        const vals = classified
          .map((c: Conversation) => (c.kpiScores as Record<string, number>)?.[key])
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

    for (const m of metrics) {
      const hour = new Date(m.createdAt).toISOString().slice(0, 13) + ":00:00Z";
      addToHour(hour, m.ttfb, m.llmDuration, m.ttsDuration, m.e2eLatency, m.userBotLatency);
    }

    // Add conversation-level latency metrics into the timeseries
    for (const c of conversations) {
      const lm = c.latencyMetrics as any[] | null;
      if (!Array.isArray(lm)) continue;
      const hour = new Date(c.createdAt).toISOString().slice(0, 13) + ":00:00Z";
      for (const m of lm) {
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
    const recentConversations = conversations.slice(0, 10).map((c: Conversation) => ({
      id: c.id,
      title: c.title,
      agentNames: c.agentNames,
      outcome: c.outcome,
      kpiScores: c.kpiScores,
      lineCount: (c.lines as unknown[]).length,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      summary: {
        totalSessions,
        totalConversations: conversations.length,
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
