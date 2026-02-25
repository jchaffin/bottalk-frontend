import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { embedBatch } from "@/lib/embeddings";
import { classifyTranscript } from "@/lib/kpis";
import { getIndex } from "@/lib/pinecone";

type TranscriptLineInput = { speaker: string; text: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseLine(v: unknown): TranscriptLineInput {
  if (!isRecord(v)) return { speaker: "Unknown", text: "" };
  return {
    speaker: typeof v.speaker === "string" ? v.speaker : "Unknown",
    text: typeof v.text === "string" ? v.text : "",
  };
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }
    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transcripts/[id] error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

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
    const rawBody = (await request.json().catch(() => null)) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};
    const lines = body.lines;
    const latencyMetrics = body.latencyMetrics;
    const summary = body.summary;

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }

    const cleanLines = Array.isArray(lines)
      ? lines.map(parseLine)
      : undefined;

    // Build the update payload
    const updateData: Record<string, unknown> = {};
    if (cleanLines) updateData.lines = cleanLines;
    if (Array.isArray(latencyMetrics)) updateData.latencyMetrics = latencyMetrics;
    if (typeof summary === "string") updateData.summary = summary;

    // Classify inline (fast) so the response includes the outcome
    let classificationData: Record<string, unknown> = {};
    let callEndedForResponse: boolean | undefined;
    if (cleanLines && cleanLines.length >= 2) {
      try {
        const agentNames = existing.agentNames as string[];
        const classification = await classifyTranscript(cleanLines, agentNames?.[0]);
        classificationData = {
          kpiScores: {
            ...classification.scores,
            turnAnnotations: classification.turnAnnotations,
          } as unknown as Record<string, unknown>,
          outcome: classification.outcome,
        };
        callEndedForResponse = classification.callEnded;
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
      const previousLines = Array.isArray(existing.lines)
        ? (existing.lines as unknown[]).map(parseLine)
        : null;
      incrementalEmbed(id, cleanLines, previousLines).catch((err) =>
        console.error("Incremental embed error:", err),
      );
    }

    return NextResponse.json({
      ...conversation,
      ...(callEndedForResponse !== undefined && { callEnded: callEndedForResponse }),
    });
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
