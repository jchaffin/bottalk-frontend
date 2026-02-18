import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY =
  process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

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
      if (PCC_API_KEY) {
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
      }

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
