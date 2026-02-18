import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * KPI definitions that transcripts are classified against.
 * Each KPI has a name, description, and scoring criteria.
 */
export const KPI_DEFINITIONS = [
  {
    key: "resolution",
    label: "Resolution",
    description: "Did the agent successfully resolve the issue or complete the objective?",
    scale: "0-100 where 100 = fully resolved",
  },
  {
    key: "sentiment",
    label: "Sentiment",
    description: "Overall sentiment of the conversation from the customer/counterpart perspective.",
    scale: "0-100 where 100 = very positive, 50 = neutral, 0 = very negative",
  },
  {
    key: "efficiency",
    label: "Efficiency",
    description: "How efficiently did the agent handle the conversation? Minimal unnecessary back-and-forth.",
    scale: "0-100 where 100 = maximally efficient",
  },
  {
    key: "professionalism",
    label: "Professionalism",
    description: "How professional, courteous, and on-brand was the agent?",
    scale: "0-100 where 100 = exemplary professionalism",
  },
  {
    key: "goalCompletion",
    label: "Goal Completion",
    description: "Did the agent achieve the stated goal (sale, support resolution, info gathering)?",
    scale: "0-100 where 100 = all goals met",
  },
] as const;

export type KpiKey = (typeof KPI_DEFINITIONS)[number]["key"];

export interface KpiScores {
  resolution: number;
  sentiment: number;
  efficiency: number;
  professionalism: number;
  goalCompletion: number;
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

/**
 * Classify a transcript against KPI definitions using GPT.
 * Returns per-KPI scores (0-100), an overall outcome label, and
 * per-turn annotations (one per transcript line).
 */
export async function classifyTranscript(
  lines: { speaker: string; text: string }[],
): Promise<ClassifyResult> {
  const kpiPrompt = KPI_DEFINITIONS.map(
    (k) => `- ${k.key} (${k.label}): ${k.description} Scale: ${k.scale}`,
  ).join("\n");

  const numberedTranscript = lines
    .map((l, i) => `[${i}] ${l.speaker}: ${l.text}`)
    .join("\n");

  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert conversation analyst. You will receive a numbered transcript.

1. Score the overall conversation against each KPI on a 0-100 scale.
2. Provide an overall outcome label.
3. For EACH turn (line), provide a brief annotation.

KPIs:
${kpiPrompt}

Outcome labels: "excellent" (avg >= 80), "good" (avg >= 65), "average" (avg >= 50), "needs_improvement" (avg >= 35), "poor" (avg < 35).

Respond with JSON:
{
  "scores": { "resolution": N, "sentiment": N, "efficiency": N, "professionalism": N, "goalCompletion": N },
  "outcome": "label",
  "turnAnnotations": [
    { "label": "Brief annotation", "sentiment": "positive"|"neutral"|"negative", "relevantKpis": ["kpiKey", ...] },
    ...
  ]
}

turnAnnotations MUST have exactly ${lines.length} entries, one per transcript line in order.
Each label should be 2-5 words (e.g. "Strong opening", "Missed objection", "Good follow-up question").
relevantKpis should list which KPI keys this turn most affects (1-2 keys).`,
      },
      {
        role: "user",
        content: numberedTranscript,
      },
    ],
  });

  const parsed = JSON.parse(res.choices[0].message.content || "{}");

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

/**
 * Derive an outcome label from KPI scores.
 */
export function outcomeFromScores(scores: KpiScores): OutcomeLabel {
  const avg =
    (scores.resolution +
      scores.sentiment +
      scores.efficiency +
      scores.professionalism +
      scores.goalCompletion) /
    5;
  if (avg >= 80) return "excellent";
  if (avg >= 65) return "good";
  if (avg >= 50) return "average";
  if (avg >= 35) return "needs_improvement";
  return "poor";
}

/** Human-readable outcome labels. */
export const OUTCOME_LABELS: Record<OutcomeLabel, string> = {
  excellent: "Excellent",
  good: "Good",
  average: "Average",
  needs_improvement: "Needs Improvement",
  poor: "Poor",
};

/** Color classes for outcome badges. */
export const OUTCOME_COLORS: Record<OutcomeLabel, string> = {
  excellent: "text-emerald-400",
  good: "text-green-400",
  average: "text-amber-400",
  needs_improvement: "text-orange-400",
  poor: "text-red-400",
};
