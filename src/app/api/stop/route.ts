import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;

export async function POST() {
  try {
    // Find ALL active sessions (not just the most recent) to avoid leaks
    const sessions = await prisma.session.findMany();

    if (sessions.length > 0) {
      // Collect every agent session ID across all sessions
      const allAgentSessionIds = sessions.flatMap(
        (s: { agentSessions: string[] }) => s.agentSessions,
      );

      // Stop every agent
      await Promise.allSettled(
        allAgentSessionIds.map((sessionId: string) =>
          fetch(`${PCC_API}/${PCC_AGENT_NAME}/stop`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PCC_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sessionId }),
          }),
        ),
      );

      // Clean up all session records
      await prisma.session.deleteMany({
        where: { id: { in: sessions.map((s: { id: string }) => s.id) } },
      });
    }
  } catch (err) {
    console.error("POST /api/stop error:", err);
  }

  return NextResponse.json({ status: "stopped" });
}
