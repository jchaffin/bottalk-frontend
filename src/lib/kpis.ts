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
3. Annotate only the NOTABLE turns — moments where something important happened (good or bad). Skip routine filler turns.

KPIs:
${kpiPrompt}

Outcome labels: "excellent" (avg >= 80), "good" (avg >= 65), "average" (avg >= 50), "needs_improvement" (avg >= 35), "poor" (avg < 35).

Annotation guidelines — only tag turns that matter:
- Sales pivots: "Discovery question", "Pain point probe", "Value prop delivery", "Trial close", "Objection reframe"
- Voice quality: "Mirroring language", "Active listening signal", "Talked over prospect"
- Mistakes: "Missed buying signal", "Too pushy too early", "Ignored objection", "Feature dump"
- Momentum shifts: "Opened next step", "Anchored pricing", "Created urgency", "Lost control"

turnAnnotations MUST have exactly ${lines.length} entries (one per line).
For notable turns: { "label": "2-6 word annotation", "sentiment": "positive"|"neutral"|"negative", "relevantKpis": ["key"] }
For unremarkable turns: { "label": "", "sentiment": "neutral", "relevantKpis": [] }

Only annotate ~30-50% of turns. Leave the rest with empty labels.`,
    input: numberedTranscript,
  });

  const outputText = response.output[0]?.type === "message"
    ? response.output[0].content[0]?.type === "output_text"
      ? response.output[0].content[0].text
      : "{}"
    : "{}";

  const parsed = JSON.parse(outputText) as unknown;

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  const parsedObj = isRecord(parsed) ? parsed : {};
  const rawTurnAnnotations = parsedObj.turnAnnotations;

  const turnAnnotations: TurnAnnotation[] = Array.isArray(rawTurnAnnotations)
    ? rawTurnAnnotations.map((a: unknown) => {
        const r = isRecord(a) ? a : {};
        const label = typeof r.label === "string" ? r.label : "";
        const rawSentiment = typeof r.sentiment === "string" ? r.sentiment : "neutral";
        const sentiment = (["positive", "neutral", "negative"].includes(rawSentiment)
          ? rawSentiment
          : "neutral") as TurnSentiment;
        const KPI_KEYS = new Set<string>(KPI_DEFINITIONS.map((d) => d.key));
        const relevantKpis = Array.isArray(r.relevantKpis)
          ? (r.relevantKpis.filter((k): k is string => typeof k === "string" && KPI_KEYS.has(k)) as KpiKey[])
          : ([] as KpiKey[]);
        return { label, sentiment, relevantKpis };
      })
    : [];

  return {
    scores: (parsedObj.scores ?? {}) as KpiScores,
    outcome: (parsedObj.outcome ?? "average") as OutcomeLabel,
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
