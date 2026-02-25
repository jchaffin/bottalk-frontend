import { NextRequest, NextResponse } from "next/server";

type AgentVars = Record<string, string>;

function toRecord(v: unknown): AgentVars {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const r: AgentVars = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof k === "string" && typeof val === "string") r[k] = val;
  }
  return r;
}

/** Shared variable names that get synced across both agents. */
const SHARED_VARS = ["topic", "company", "product", "price"] as const;

/**
 * POST /api/sync-variables — Sync shared variables (topic, etc.) from one agent to the other.
 * Body: { agent1: Record<string, string>, agent2: Record<string, string>, sourceSlot?: "agent1" | "agent2" }
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const body = raw as {
      agent1?: unknown;
      agent2?: unknown;
      sourceSlot?: string;
    };

    const vars = {
      agent1: toRecord(body.agent1),
      agent2: toRecord(body.agent2),
    };
    const sourceSlot =
      typeof body.sourceSlot === "string" && (body.sourceSlot === "agent1" || body.sourceSlot === "agent2")
        ? body.sourceSlot
        : undefined;

    if (sourceSlot) {
      const source = vars[sourceSlot];
      const targetSlot = sourceSlot === "agent1" ? "agent2" : "agent1";
      for (const key of SHARED_VARS) {
        if (source[key] !== undefined && source[key] !== "") {
          vars[targetSlot] = { ...vars[targetSlot], [key]: source[key] };
        }
      }
    }

    return NextResponse.json(vars);
  } catch (err) {
    console.error("POST /api/sync-variables error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
