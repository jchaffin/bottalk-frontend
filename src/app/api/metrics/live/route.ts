import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Session } from "@/generated/prisma/client";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY =
  process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * GET /api/metrics/live — Fetch live latency metrics from active PCC sessions.
 *
 * Queries each active session's `/metrics` endpoint via the PCC Session API
 * proxy, returning real-time data without a database round-trip.
 *
 * Query params:
 *   ?sessionId=xxx   — fetch metrics for a single session (by DB session ID)
 *   (no params)      — fetch metrics for all active sessions
 */
export async function GET(request: NextRequest) {
  try {
    if (!PCC_API_KEY) {
      return NextResponse.json(
        { detail: "Missing PIPECAT_CLOUD_PUBLIC_API_KEY (or PIPECAT_CLOUD_API_KEY)" },
        { status: 500 },
      );
    }
    const { searchParams } = new URL(request.url);
    const filterSessionId = searchParams.get("sessionId");

    // Look up active sessions from DB.
    const where = filterSessionId ? { id: filterSessionId } : {};
    const sessions = await prisma.session.findMany({ where });

    if (sessions.length === 0) {
      return NextResponse.json({ sessions: [], message: "No active sessions" });
    }

    // Query each PCC session's /metrics endpoint in parallel.
    const results = await Promise.allSettled(
      sessions.flatMap((session: Session) =>
        session.agentSessions.map(async (pccSessionId) => {
          const url = `${PCC_API}/${PCC_AGENT_NAME}/sessions/${pccSessionId}/metrics`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${PCC_API_KEY}` },
            signal: AbortSignal.timeout(5_000),
          });
          if (!res.ok) {
            return {
              pccSessionId,
              dbSessionId: session.id,
              roomName: session.roomName,
              error: `PCC returned ${res.status}`,
            };
          }
          const raw = await res.json();
          const data = isRecord(raw) ? raw : { raw };
          return {
            pccSessionId,
            dbSessionId: session.id,
            roomName: session.roomName,
            ...data,
          };
        }),
      ),
    );

    const live: Record<string, unknown>[] = results.map(
      (r: PromiseSettledResult<Record<string, unknown>>) =>
        r.status === "fulfilled"
          ? r.value
          : { error: (r as PromiseRejectedResult).reason?.message ?? "Unknown error" },
    );

    // Compute cross-session aggregate.
    const allTimeseries = live.flatMap((s) => {
      const ts = s.timeseries;
      return Array.isArray(ts) ? ts : [];
    });

    const vals = (key: string) =>
      allTimeseries
        .map((m: Record<string, unknown>) => m[key])
        .filter((v: unknown): v is number => typeof v === "number");

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const ttfb = vals("ttfb");
    const llm = vals("llm_duration");
    const tts = vals("tts_duration");
    const e2e = vals("e2e_latency");

    return NextResponse.json({
      sessions: live,
      aggregate: {
        count: allTimeseries.length,
        ttfb: avg(ttfb),
        llm: avg(llm),
        tts: avg(tts),
        e2e: avg(e2e),
      },
    });
  } catch (err) {
    console.error("GET /api/metrics/live error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
