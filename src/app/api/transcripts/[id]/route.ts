import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { embedBatch } from "@/lib/embeddings";
import { classifyTranscript } from "@/lib/kpis";
import { getIndex } from "@/lib/pinecone";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (err) {
    console.error("GET /api/transcripts/[id] error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/transcripts/[id] — Incrementally update a conversation.
 *
 * Body: { lines, latencyMetrics?, summary? }
 *
 * Accepts the full current lines array. Embeds any new lines that
 * haven't been embedded yet, re-classifies KPIs, and updates the
 * summary field.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { lines, latencyMetrics, summary } = body;

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }

    const cleanLines = Array.isArray(lines)
      ? lines.map((l: any) => ({ speaker: l.speaker ?? "Unknown", text: l.text ?? "" }))
      : undefined;

    // Build the update payload
    const updateData: Record<string, unknown> = {};
    if (cleanLines) updateData.lines = cleanLines;
    if (Array.isArray(latencyMetrics)) updateData.latencyMetrics = latencyMetrics;
    if (typeof summary === "string") updateData.summary = summary;

    // Classify inline (fast) so the response includes the outcome
    let classificationData: Record<string, unknown> = {};
    if (cleanLines && cleanLines.length >= 2) {
      try {
        const classification = await classifyTranscript(cleanLines);
        classificationData = {
          kpiScores: {
            ...classification.scores,
            turnAnnotations: classification.turnAnnotations,
          } as unknown as Record<string, unknown>,
          outcome: classification.outcome,
        };
      } catch (err) {
        console.error("Inline classify error:", err);
      }
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { ...updateData, ...classificationData },
    });

    // Embed new lines in the background (fire-and-forget)
    if (cleanLines && cleanLines.length > 0 && process.env.PINECONE_API_KEY) {
      incrementalEmbed(id, cleanLines, existing.lines as any[] | null).catch((err) =>
        console.error("Incremental embed error:", err),
      );
    }

    return NextResponse.json(conversation);
  } catch (err) {
    console.error("PATCH /api/transcripts/[id] error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * Embed only the new lines that haven't been embedded yet.
 * Classification is done inline in the PATCH handler.
 */
async function incrementalEmbed(
  conversationId: string,
  allLines: { speaker: string; text: string }[],
  previousLines: { speaker: string; text: string }[] | null,
) {
  const startIdx = previousLines?.length ?? 0;
  const newLines = allLines.slice(startIdx);
  if (newLines.length === 0) return;

  const embeddingPrefix = `conv-${conversationId}`;
  const newTexts = newLines.map((l) => `${l.speaker}: ${l.text}`);
  const embeddings = await embedBatch(newTexts);

  const index = getIndex();
  const records = embeddings.map((values, i) => ({
    id: `${embeddingPrefix}-${startIdx + i}`,
    values,
    metadata: {
      conversationId,
      lineIndex: startIdx + i,
      speaker: newLines[i].speaker,
      text: newLines[i].text,
    },
  }));

  for (let i = 0; i < records.length; i += 100) {
    await index.upsert({ records: records.slice(i, i + 100) });
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { embeddingId: embeddingPrefix },
  });
}
