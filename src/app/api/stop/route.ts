import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY =
  process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;
const PCC_PRIVATE_API_KEY = process.env.PIPECAT_CLOUD_PRIVATE_API_KEY;
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

async function stopPCCSession(sessionId: string): Promise<void> {
  if (PCC_PRIVATE_API_KEY) {
    await fetch(`https://api.pipecat.daily.co/v1/agents/${PCC_AGENT_NAME}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${PCC_PRIVATE_API_KEY}` },
    }).catch(() => {});
    return;
  }
  if (!PCC_API_KEY) return;
  await fetch(`${PCC_API}/${PCC_AGENT_NAME}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PCC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

export async function POST() {
  try {
    const sessions = await prisma.session.findMany();

    if (sessions.length > 0) {
      const allAgentSessionIds = sessions.flatMap(
        (s: { agentSessions: string[] }) => s.agentSessions,
      );
      const allRoomNames = sessions.map(
        (s: { roomName: string }) => s.roomName,
      );

      // Stop every agent on Pipecat Cloud
      await Promise.allSettled(allAgentSessionIds.map(stopPCCSession));

      // Delete the Daily rooms to force-disconnect any stragglers
      await Promise.allSettled(
        allRoomNames.map((roomName: string) =>
          fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
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
