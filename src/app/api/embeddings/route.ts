import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getIndex } from "@/lib/pinecone";
import { embedText, embedBatch } from "@/lib/embeddings";
import { classifyTranscript } from "@/lib/kpis";

/**
 * POST /api/embeddings — Embed each utterance of a conversation transcript,
 * classify KPIs, and upsert per-utterance vectors into Pinecone.
 *
 * Body: { conversationId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { detail: "conversationId is required" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json(
        { detail: "Conversation not found" },
        { status: 404 },
      );
    }

    const lines = conversation.lines as { speaker: string; text: string }[];

    // Generate per-utterance embeddings + classify KPIs in parallel
    const utteranceTexts = lines.map((l) => `${l.speaker}: ${l.text}`);
    const [embeddings, classification] = await Promise.all([
      embedBatch(utteranceTexts),
      classifyTranscript(lines),
    ]);

    // Upsert per-utterance vectors to Pinecone
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
        title: conversation.title,
        agentNames: conversation.agentNames,
        outcome: classification.outcome,
        createdAt: conversation.createdAt.toISOString(),
      },
    }));

    // Pinecone upsert in batches of 100
    for (let i = 0; i < records.length; i += 100) {
      await index.upsert({ records: records.slice(i, i + 100) });
    }

    // Update conversation record with KPI data
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

    return NextResponse.json({
      conversationId,
      embeddingPrefix,
      vectorCount: records.length,
      scores: classification.scores,
      outcome: classification.outcome,
    });
  } catch (err) {
    console.error("POST /api/embeddings error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/embeddings — Query Pinecone for similar utterances.
 * Query params: ?text=search+query&topK=20
 *
 * Returns per-utterance matches grouped by conversation, with the
 * best-matching utterance per conversation surfaced first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const queryText = searchParams.get("text");
    const topK = parseInt(searchParams.get("topK") || "20", 10);

    let queryVector: number[];

    if (conversationId) {
      // Use the first utterance as the query vector for conversation similarity
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation) {
        return NextResponse.json(
          { detail: "Conversation not found" },
          { status: 404 },
        );
      }
      const lines = conversation.lines as { speaker: string; text: string }[];
      const firstLine = lines[0];
      queryVector = await embedText(
        firstLine ? `${firstLine.speaker}: ${firstLine.text}` : "",
      );
    } else if (queryText) {
      queryVector = await embedText(queryText);
    } else {
      return NextResponse.json(
        { detail: "Provide conversationId or text query param" },
        { status: 400 },
      );
    }

    const index = getIndex();
    const results = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

    // Group matches by conversation, keeping the best-scoring utterance per conversation
    const byConversation = new Map<
      string,
      { bestScore: number; bestUtterance: any; utterances: any[] }
    >();

    for (const match of results.matches ?? []) {
      const meta = match.metadata as Record<string, any> | undefined;
      const convId = meta?.conversationId as string | undefined;
      if (!convId) continue;

      const utterance = {
        id: match.id,
        score: match.score,
        lineIndex: meta?.lineIndex,
        speaker: meta?.speaker,
        text: meta?.text,
      };

      const existing = byConversation.get(convId);
      if (existing) {
        existing.utterances.push(utterance);
        if ((match.score ?? 0) > existing.bestScore) {
          existing.bestScore = match.score ?? 0;
          existing.bestUtterance = utterance;
        }
      } else {
        byConversation.set(convId, {
          bestScore: match.score ?? 0,
          bestUtterance: utterance,
          utterances: [utterance],
        });
      }
    }

    // Sort conversations by best score descending
    const conversations = [...byConversation.entries()]
      .sort(([, a], [, b]) => b.bestScore - a.bestScore)
      .map(([convId, data]) => ({
        conversationId: convId,
        bestScore: data.bestScore,
        bestUtterance: data.bestUtterance,
        matchingUtterances: data.utterances.sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0),
        ),
      }));

    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("GET /api/embeddings error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
