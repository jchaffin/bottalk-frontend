import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const META_PROMPT = `You are a conversation designer. Given a topic, generate system prompts for two AI voice agents who will have a live phone conversation.

Choose fitting names for each agent based on the topic. Assign complementary roles (e.g. sales rep / customer, interviewer / candidate, agent / caller, consultant / client). Agent 1 always initiates the conversation.

Return ONLY valid JSON with this exact structure:
{
  "agent1": {
    "name": "chosen first name",
    "role": "short role title",
    "prompt": "full system prompt"
  },
  "agent2": {
    "name": "chosen first name",
    "role": "short role title",
    "prompt": "full system prompt"
  }
}

Each prompt MUST include the agent's name (e.g. "You are <name>, ...") and end with these rules:
Rules:
- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.
- Stay in character. Be natural and conversational.

Make the prompts specific to the topic. Give each agent a clear personality, goals, and relevant background knowledge. Keep each prompt under 200 words.`;

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== "string" || topic.trim().length < 5) {
      return NextResponse.json(
        { detail: "Topic must be at least 5 characters." },
        { status: 400 },
      );
    }

    if (topic.length > 500) {
      return NextResponse.json(
        { detail: "Topic must be under 500 characters." },
        { status: 400 },
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: META_PROMPT },
          { role: "user", content: `Topic: ${topic.trim()}` },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Validate structure
    if (
      !parsed.agent1?.name || !parsed.agent1?.role || !parsed.agent1?.prompt ||
      !parsed.agent2?.name || !parsed.agent2?.role || !parsed.agent2?.prompt
    ) {
      throw new Error("Invalid prompt structure from LLM");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("POST /api/generate-prompts error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to generate prompts" },
      { status: 500 },
    );
  }
}
