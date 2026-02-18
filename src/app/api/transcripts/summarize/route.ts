import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * POST /api/transcripts/summarize
 *
 * Generates a concise live summary of a conversation-in-progress.
 * Body: { lines: { speaker: string; text: string }[] }
 *
 * Returns: { summary: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { lines } = await request.json();

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ summary: "" });
    }

    const transcript = lines
      .map((l: { speaker: string; text: string }) => `${l.speaker}: ${l.text}`)
      .join("\n");

    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are an expert conversation analyst providing a live summary of an ongoing sales call between AI agents.

Write a concise 2-4 sentence summary covering:
- What stage the conversation is at (intro, discovery, pitch, objection handling, closing)
- Key topics discussed so far
- Current trajectory (positive, stalled, negative)

Be direct and factual. No markdown, no bullets. Plain text only.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    const summary = res.choices[0].message.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("POST /api/transcripts/summarize error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
