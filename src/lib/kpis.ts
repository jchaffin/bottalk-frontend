import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export const KPI_DEFINITIONS = [
  {
    key: "discovery",
    label: "Discovery",
    description: "Did the sales rep ask probing questions to uncover pain points, budget, timeline, and decision process?",
    scale: "0-100 where 100 = deep, thorough discovery",
  },
  {
    key: "objectionHandling",
    label: "Objection Handling",
    description: "How well were the prospect's concerns, hesitations, and objections acknowledged and reframed?",
    scale: "0-100 where 100 = masterful reframing, 0 = ignored or fumbled",
  },
  {
    key: "valueArticulation",
    label: "Value Articulation",
    description: "Did the rep connect product capabilities to the prospect's specific stated needs and pain points (not generic feature dumping)?",
    scale: "0-100 where 100 = perfectly tailored value prop",
  },
  {
    key: "turnTaking",
    label: "Turn-Taking",
    description: "Natural conversation flow: no talking over the other speaker, appropriate pause length, not rushing or dragging.",
    scale: "0-100 where 100 = perfectly natural flow",
  },
  {
    key: "responseRelevance",
    label: "Relevance",
    description: "Were responses on-topic, contextually appropriate, and directly addressing what the other speaker said?",
    scale: "0-100 where 100 = every response directly relevant",
  },
  {
    key: "nextSteps",
    label: "Next Steps",
    description: "Did the sales rep drive toward a concrete next action — demo, free trial, follow-up call, or decision timeline?",
    scale: "0-100 where 100 = clear next step secured",
  },
] as const;

export type KpiKey = (typeof KPI_DEFINITIONS)[number]["key"];

export interface KpiScores {
  discovery: number;
  objectionHandling: number;
  valueArticulation: number;
  turnTaking: number;
  responseRelevance: number;
  nextSteps: number;
}

export type OutcomeLabel =
  | "excellent"
  | "good"
  | "average"
  | "needs_improvement"
  | "poor";

export type TurnSentiment = "positive" | "neutral" | "negative";

export interface TurnAnnotation {
  label: string;
  sentiment: TurnSentiment;
  relevantKpis: KpiKey[];
}

export interface ClassifyResult {
  scores: KpiScores;
  outcome: OutcomeLabel;
  turnAnnotations: TurnAnnotation[];
}

const CLASSIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    scores: {
      type: "object" as const,
      properties: {
        discovery: { type: "number" as const },
        objectionHandling: { type: "number" as const },
        valueArticulation: { type: "number" as const },
        turnTaking: { type: "number" as const },
        responseRelevance: { type: "number" as const },
        nextSteps: { type: "number" as const },
      },
      required: ["discovery", "objectionHandling", "valueArticulation", "turnTaking", "responseRelevance", "nextSteps"],
      additionalProperties: false,
    },
    outcome: {
      type: "string" as const,
      enum: ["excellent", "good", "average", "needs_improvement", "poor"],
    },
    turnAnnotations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          label: { type: "string" as const },
          sentiment: { type: "string" as const, enum: ["positive", "neutral", "negative"] },
          relevantKpis: {
            type: "array" as const,
            items: { type: "string" as const },
          },
        },
        required: ["label", "sentiment", "relevantKpis"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores", "outcome", "turnAnnotations"],
  additionalProperties: false,
};

export async function classifyTranscript(
  lines: { speaker: string; text: string }[],
): Promise<ClassifyResult> {
  const kpiPrompt = KPI_DEFINITIONS.map(
    (k) => `- ${k.key} (${k.label}): ${k.description} Scale: ${k.scale}`,
  ).join("\n");

  const numberedTranscript = lines
    .map((l, i) => `[${i}] ${l.speaker}: ${l.text}`)
    .join("\n");

  const speakerNames = [...new Set(lines.map((l) => l.speaker))];

  const response = await getOpenAI().responses.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    text: {
      format: {
        type: "json_schema",
        name: "classify_result",
        strict: true,
        schema: CLASSIFY_SCHEMA,
      },
    },
    instructions: `You are an expert voice AI sales call analyst. You will receive a numbered transcript of a live sales call between AI voice agents.

Speakers: ${speakerNames.join(", ")}

1. Score the conversation against each KPI (0-100).
2. Provide an overall outcome label.
3. For EACH turn, provide a specific, actionable annotation about what the agent did.

KPIs:
${kpiPrompt}

Outcome labels: "excellent" (avg >= 80), "good" (avg >= 65), "average" (avg >= 50), "needs_improvement" (avg >= 35), "poor" (avg < 35).

Annotation guidelines — be SPECIFIC about the sales technique used, not generic praise:
- Sales stage: "Discovery question", "Pain point probe", "Value prop delivery", "Trial close", "Objection reframe"
- Voice technique: "Mirroring language", "Building rapport", "Active listening signal", "Empathy statement"
- Issues: "Talked over prospect", "Missed buying signal", "Too pushy too early", "Ignored objection", "Feature dump without context"
- Momentum: "Opened next step", "Anchored pricing", "Created urgency", "Lost control of conversation"

turnAnnotations MUST have exactly ${lines.length} entries, one per transcript line in order.
Each label should be 2-6 words describing the specific sales technique or issue.
relevantKpis: 1-2 KPI keys this turn most impacts.`,
    input: numberedTranscript,
  });

  const outputText = response.output[0]?.type === "message"
    ? response.output[0].content[0]?.type === "output_text"
      ? response.output[0].content[0].text
      : "{}"
    : "{}";

  const parsed = JSON.parse(outputText);

  const turnAnnotations: TurnAnnotation[] = Array.isArray(parsed.turnAnnotations)
    ? parsed.turnAnnotations.map((a: any) => ({
        label: a.label || "",
        sentiment: (["positive", "neutral", "negative"].includes(a.sentiment) ? a.sentiment : "neutral") as TurnSentiment,
        relevantKpis: Array.isArray(a.relevantKpis) ? a.relevantKpis : [],
      }))
    : [];

  return {
    scores: parsed.scores as KpiScores,
    outcome: parsed.outcome as OutcomeLabel,
    turnAnnotations,
  };
}

export function outcomeFromScores(scores: KpiScores): OutcomeLabel {
  const avg =
    (scores.discovery +
      scores.objectionHandling +
      scores.valueArticulation +
      scores.turnTaking +
      scores.responseRelevance +
      scores.nextSteps) /
    6;
  if (avg >= 80) return "excellent";
  if (avg >= 65) return "good";
  if (avg >= 50) return "average";
  if (avg >= 35) return "needs_improvement";
  return "poor";
}

export const OUTCOME_LABELS: Record<OutcomeLabel, string> = {
  excellent: "Excellent",
  good: "Good",
  average: "Average",
  needs_improvement: "Needs Improvement",
  poor: "Poor",
};

export const OUTCOME_COLORS: Record<OutcomeLabel, string> = {
  excellent: "text-emerald-400",
  good: "text-green-400",
  average: "text-amber-400",
  needs_improvement: "text-orange-400",
  poor: "text-red-400",
};
