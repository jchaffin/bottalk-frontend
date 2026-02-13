import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(conversations);
  } catch (err) {
    console.error("GET /api/transcripts error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, agentNames, lines } = body;

    if (!title || !Array.isArray(agentNames) || !Array.isArray(lines)) {
      return NextResponse.json(
        { detail: "title, agentNames, and lines are required" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        title: String(title).slice(0, 500),
        agentNames: agentNames.map(String).slice(0, 2),
        lines: lines.map((l: { speaker?: string; text?: string }) => ({
          speaker: l.speaker ?? "Unknown",
          text: l.text ?? "",
        })),
      },
    });

    return NextResponse.json(conversation);
  } catch (err) {
    console.error("POST /api/transcripts error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
