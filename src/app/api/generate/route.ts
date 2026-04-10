import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH, DEFAULT_AGENT_1_NAME } from "@/lib/config";

const defaultEntry = z.object({
  variable: z.string().describe("The variable name (e.g. agent_name)"),
  value: z.string().describe("The suggested default value"),
});

const agentSchema = z.object({
  name: z.string(),
  role: z.string(),
  prompt: z.string(),
  defaults: z.array(defaultEntry).describe("Default values for every {{variable}} used in the prompt"),
});

const schema = z.object({
  system: agentSchema,
  user: agentSchema,
});

/** Convert the array-of-objects from the LLM into a plain Record. */
function toDefaultsRecord(arr: { variable: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(arr.map(({ variable, value }) => [variable, value]));
}

const SYSTEM_PROMPT = `You are a conversation designer for an A/B testing platform. Given a topic, generate system prompts for two AI voice agents who will have a live phone conversation.

There are exactly two roles:
- "system": The AI bot being tested/evaluated. This is the agent whose performance is measured by KPIs. It always initiates the conversation. Design it with clear goals and techniques to evaluate (e.g. sales rep, interviewer, support agent, consultant).
- "user": The user-simulator bot. It models a realistic human counterpart (e.g. customer, candidate, caller, client). It responds naturally to the system bot. It should be consistent and realistic so that A/B tests of different system bot configurations are comparable.

Choose fitting names for each agent based on the topic.

IMPORTANT: Use {{variable_name}} template syntax for ALL specific nouns in the prompts — company names, product names, job titles, prices, team sizes, pain points, backstory details, etc. This allows users to customize the scenario. Use snake_case for variable names.

For each agent, also return a "defaults" object mapping every variable name to its suggested default value.

Example prompt fragment: "You are {{agent_name}}, a {{role}} at {{company}}. Your product — {{product}} — costs {{price}}."
Example defaults: [{ "variable": "agent_name", "value": "${DEFAULT_AGENT_1_NAME}" }, { "variable": "role", "value": "sales rep" }, { "variable": "company", "value": "bottalk" }]

Each prompt MUST end with these rules:
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

    // Reshape defaults from array-of-objects back to Record<string, string>
    // so the rest of the app receives the expected shape.
    const response = output
      ? {
          system: { ...output.system, defaults: toDefaultsRecord(output.system.defaults) },
          user: { ...output.user, defaults: toDefaultsRecord(output.user.defaults) },
        }
      : output;

    return NextResponse.json(response);
  } catch (err) {
    console.error("POST /api/generate error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to generate prompts" },
      { status: 500 },
    );
  }
}
