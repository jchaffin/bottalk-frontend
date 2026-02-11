import { NextResponse } from "next/server";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const AGENT_NAME = process.env.PCC_AGENT_NAME || "outrival-agent";

export async function POST() {
  // Best-effort termination — don't fail the response if PCC is unreachable.
  try {
    // Import the active sessions from the start route.
    // In production you'd store these in a database or KV store.
    // For now this is a simple in-memory approach that works for
    // single-instance Vercel deployments.
    const startModule = await import("../start/route");
    const sessions: string[] = (startModule as any).activeSessions || [];

    await Promise.allSettled(
      sessions.map((sessionId) =>
        fetch(`${PCC_API}/${AGENT_NAME}/stop`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PCC_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        }),
      ),
    );
  } catch (err) {
    console.error("POST /api/stop error:", err);
  }

  return NextResponse.json({ status: "stopped" });
}
