import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { embedBatch } from "@/lib/embeddings";
import { classifyTranscript } from "@/lib/kpis";
import { getIndex } from "@/lib/pinecone";

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
    const { title, agentNames, lines, roomUrl, latencyMetrics } = body;

    if (!title || !Array.isArray(agentNames) || !Array.isArray(lines)) {
      return NextResponse.json(
        { detail: "title, agentNames, and lines are required" },
        { status: 400 },
      );
    }

    const cleanLines = lines.map((l: { speaker?: string; text?: string }) => ({
      speaker: l.speaker ?? "Unknown",
      text: l.text ?? "",
    }));

    const conversation = await prisma.conversation.create({
      data: {
        title: String(title).slice(0, 500),
        agentNames: agentNames.map(String).slice(0, 2),
        lines: cleanLines,
        roomUrl: roomUrl ? String(roomUrl) : null,
        latencyMetrics: Array.isArray(latencyMetrics) ? latencyMetrics : null,
      },
    });

    // Auto-embed + classify if Pinecone is configured (fire-and-forget)
    if (process.env.PINECONE_API_KEY && cleanLines.length > 0) {
      embedAndClassify(conversation.id, cleanLines, agentNames?.[0]).catch((err) =>
        console.error("Auto-embed error:", err),
      );
    }

    return NextResponse.json(conversation);
  } catch (err) {
    console.error("POST /api/transcripts error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

async function embedAndClassify(
  conversationId: string,
  lines: { speaker: string; text: string }[],
  agentName?: string,
) {
  const utteranceTexts = lines.map((l) => `${l.speaker}: ${l.text}`);
  const [embeddings, classification] = await Promise.all([
    embedBatch(utteranceTexts),
    classifyTranscript(lines, agentName),
  ]);

  const embeddingPrefix = `conv-${conversationId}`;
  const index = getIndex();
  const records = embeddings.map((values, i) => ({
    id: `${embeddingPrefix}-${i}`,
    values,
    metadata: {
      conversationId,
      lineIndex: i,
      speaker: lines[i].speaker,
      text: lines[i].text,
      outcome: classification.outcome,
    },
  }));

  for (let i = 0; i < records.length; i += 100) {
    await index.upsert({ records: records.slice(i, i + 100) });
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      embeddingId: embeddingPrefix,
      kpiScores: {
        ...classification.scores,
        turnAnnotations: classification.turnAnnotations,
      } as unknown as Record<string, unknown>,
      outcome: classification.outcome,
    },
  });
}
