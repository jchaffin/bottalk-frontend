import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const AGENT_NAME = process.env.PCC_AGENT_NAME || "outrival-agent";

export async function POST() {
  try {
    // Find the most recent session
    const session = await prisma.session.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (session) {
      // Stop all agent sessions
      await Promise.allSettled(
        session.agentSessions.map((sessionId: string) =>
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

      // Clean up the session record
      await prisma.session.delete({ where: { id: session.id } });
    }
  } catch (err) {
    console.error("POST /api/stop error:", err);
  }

  return NextResponse.json({ status: "stopped" });
}
