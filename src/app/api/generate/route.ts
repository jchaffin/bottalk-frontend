import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH } from "@/lib/config";

const schema = z.object({
  agent1: z.object({
    name: z.string(),
    role: z.string(),
    prompt: z.string(),
  }),
  agent2: z.object({
    name: z.string(),
    role: z.string(),
    prompt: z.string(),
  }),
});

const SYSTEM_PROMPT = `You are a conversation designer. Given a topic, generate system prompts for two AI voice agents who will have a live phone conversation.

Choose fitting names for each agent based on the topic. Assign complementary roles (e.g. sales rep / customer, interviewer / candidate, agent / caller, consultant / client). Agent 1 always initiates the conversation.

Each prompt MUST include the agent's name (e.g. "You are <name>, ...") and end with these rules:
Rules:
- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.
- Stay in character. Be natural and conversational.

Make the prompts specific to the topic. Give each agent a clear personality, goals, and relevant background knowledge. Keep each prompt under 200 words.`;

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== "string" || topic.trim().length < TOPIC_MIN_LENGTH) {
      return NextResponse.json(
        { detail: `Topic must be at least ${TOPIC_MIN_LENGTH} characters.` },
        { status: 400 },
      );
    }

    if (topic.length > TOPIC_MAX_LENGTH) {
      return NextResponse.json(
        { detail: `Topic must be under ${TOPIC_MAX_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const { output } = await generateText({
      model: openai("gpt-4o-mini"),
      output: Output.object({ schema }),
      system: SYSTEM_PROMPT,
      prompt: `Topic: ${topic.trim()}`,
    });

    return NextResponse.json(output);
  } catch (err) {
    console.error("POST /api/generate error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to generate prompts" },
      { status: 500 },
    );
  }
}
