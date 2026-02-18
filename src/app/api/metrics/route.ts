import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { SessionMetric } from "@/generated/prisma/client";

/**
 * POST /api/metrics — Ingest latency metrics from Pipecat agents.
 * Called by the agent's MetricsWebhookObserver after each turn.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      session_id,
      agent_name,
      ttfb,
      llm_duration,
      tts_duration,
      e2e_latency,
      user_bot_latency,
      token_usage,
      turn_index,
    } = body;

    if (!session_id || !agent_name) {
      return NextResponse.json(
        { detail: "session_id and agent_name are required" },
        { status: 400 },
      );
    }

    const metric = await prisma.sessionMetric.create({
      data: {
        sessionId: session_id,
        agentName: agent_name,
        ttfb: ttfb ?? null,
        llmDuration: llm_duration ?? null,
        ttsDuration: tts_duration ?? null,
        e2eLatency: e2e_latency ?? null,
        userBotLatency: user_bot_latency ?? null,
        tokenUsage: token_usage ?? null,
        turnIndex: turn_index ?? 0,
      },
    });

    return NextResponse.json({ id: metric.id });
  } catch (err) {
    console.error("POST /api/metrics error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/metrics — Fetch aggregated latency metrics.
 * Query params: ?days=7&sessionId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7", 10);
    const sessionId = searchParams.get("sessionId");

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      createdAt: { gte: since },
    };
    if (sessionId) where.sessionId = sessionId;

    const metrics = await prisma.sessionMetric.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    // Compute aggregates
    const valid = (arr: (number | null)[]) =>
      arr.filter((v): v is number => v !== null);

    const ttfbValues = valid(metrics.map((m: SessionMetric) => m.ttfb));
    const llmValues = valid(metrics.map((m: SessionMetric) => m.llmDuration));
    const ttsValues = valid(metrics.map((m: SessionMetric) => m.ttsDuration));
    const e2eValues = valid(metrics.map((m: SessionMetric) => m.e2eLatency));
    const ublValues = valid(metrics.map((m: SessionMetric) => m.userBotLatency));

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const p50 = (arr: number[]) => {
      if (!arr.length) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const p95 = (arr: number[]) => {
      if (!arr.length) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.95)];
    };

    return NextResponse.json({
      count: metrics.length,
      period: { days, since: since.toISOString() },
      aggregates: {
        ttfb: { avg: avg(ttfbValues), p50: p50(ttfbValues), p95: p95(ttfbValues) },
        llm: { avg: avg(llmValues), p50: p50(llmValues), p95: p95(llmValues) },
        tts: { avg: avg(ttsValues), p50: p50(ttsValues), p95: p95(ttsValues) },
        e2e: { avg: avg(e2eValues), p50: p50(e2eValues), p95: p95(e2eValues) },
        user_bot_latency: { avg: avg(ublValues), p50: p50(ublValues), p95: p95(ublValues) },
      },
      timeseries: metrics.map((m: SessionMetric) => ({
        id: m.id,
        sessionId: m.sessionId,
        agentName: m.agentName,
        ttfb: m.ttfb,
        llmDuration: m.llmDuration,
        ttsDuration: m.ttsDuration,
        e2eLatency: m.e2eLatency,
        userBotLatency: m.userBotLatency,
        turnIndex: m.turnIndex,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("GET /api/metrics error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
