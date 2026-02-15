/**
 * Centralized config.
 */

export const VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Sarah", label: "Sarah (Female)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Mike", label: "Mike (Male)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", label: "Bella (Female)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", label: "Antoni (Male)" },
] as const;

export const DEFAULT_VOICE_1 = VOICES[0].id;
export const DEFAULT_VOICE_2 = VOICES[1].id;

export const TOPIC_MIN_LENGTH = 5;
export const TOPIC_MAX_LENGTH = 500;

export const AGENT_COLORS = ["bg-accent-agent1", "bg-accent-agent2"] as const;

/** Default agent avatar colors as hex values (matches --accent-agent1 / --accent-agent2). */
export const DEFAULT_AGENT_COLORS: [string, string] = ["#686EFF", "#f59e0b"];

export const DEFAULT_SCENARIO_SLUG = "sales";
export const DEFAULT_TOPIC = "enterprise software sales";

export const PCC_AGENT_NAME = "outrival-agent";

/** Label for app-messages (agent transcript events). Must match agents. */
export const APP_MESSAGE_LABEL = "outrival";

// ---------------------------------------------------------------------------
// Prompt template variables
// ---------------------------------------------------------------------------

/** Parse all {{varName}} tokens from a string. Returns unique names in order of first appearance. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

/** Replace all {{varName}} placeholders in text with values from the map. Unreplaced variables are left as-is. */
export function replaceVariables(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => vars[key] ?? match,
  );
}
