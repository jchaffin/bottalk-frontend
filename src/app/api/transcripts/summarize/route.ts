import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SUMMARY_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: { type: "string" as const },
  },
  required: ["summary"],
  additionalProperties: false,
};

/**
 * POST /api/transcripts/summarize
 *
 * Generates a concise live summary of a conversation-in-progress.
 * Body: { lines: { speaker: string; text: string }[] }
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

    const response = await getOpenAI().responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      max_output_tokens: 300,
      text: {
        format: {
          type: "json_schema",
          name: "summary_result",
          strict: true,
          schema: SUMMARY_SCHEMA,
        },
      },
      instructions: `You are an expert conversation analyst providing a live summary of an ongoing sales call between AI agents.

Write a concise 2-4 sentence summary covering:
- What stage the conversation is at (intro, discovery, pitch, objection handling, closing)
- Key topics discussed so far
- Current trajectory (positive, stalled, negative)

Be direct and factual. Plain text only.`,
      input: transcript,
    });

    const outputText = response.output[0]?.type === "message"
      ? response.output[0].content[0]?.type === "output_text"
        ? response.output[0].content[0].text
        : "{}"
      : "{}";

    const parsed = JSON.parse(outputText);
    return NextResponse.json({ summary: parsed.summary || "" });
  } catch (err) {
    console.error("POST /api/transcripts/summarize error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
