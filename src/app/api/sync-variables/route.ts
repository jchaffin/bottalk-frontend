import { NextRequest, NextResponse } from "next/server";
import { syncSharedVariables } from "@/lib/sync-variables";

export type { AgentVariables } from "@/lib/sync-variables";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object" || !("agent1" in body) || !("agent2" in body)) {
      return NextResponse.json({ detail: "Expected { agent1, agent2 }" }, { status: 400 });
    }

    const toRecord = (v: unknown): Record<string, string> => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      const r: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) {
        if (typeof k === "string" && typeof val === "string") r[k] = val;
      }
      return r;
    };

    const vars = {
      agent1: toRecord(body.agent1),
      agent2: toRecord(body.agent2),
    };

    const synced = syncSharedVariables(vars);
    return NextResponse.json(synced);
  } catch (err) {
    console.error("POST /api/sync-variables error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
