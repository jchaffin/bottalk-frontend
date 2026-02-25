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

/** Default agent display names (used for Quick Start, fallbacks, seed). */
export const DEFAULT_AGENT_1_NAME = VOICES[0].name;
export const DEFAULT_AGENT_2_NAME = VOICES[1].name;

/** Fallback labels when no scenario selected. System = goes_first, User = counterpart. */
export const SYSTEM_AGENT_LABEL = "System";
export const USER_AGENT_LABEL = "User";

export const TOPIC_MIN_LENGTH = 5;
export const TOPIC_MAX_LENGTH = 500;

export const AGENT_COLORS = ["bg-accent-agent1", "bg-accent-agent2"] as const;

/** Default agent avatar colors as hex values (matches --accent-agent1 / --accent-agent2). */
export const DEFAULT_AGENT_COLORS: [string, string] = ["#686EFF", "#f59e0b"];

export const DEFAULT_SCENARIO_SLUG = "sales";
export const DEFAULT_TOPIC = "enterprise software sales";

export const PCC_AGENT_NAME =
  process.env.NEXT_PUBLIC_PCC_AGENT_NAME ||
  process.env.PCC_AGENT_NAME ||
  "bottalk-agent";

export const PCC_AGENT_NAME_LOCAL = "bottalk-agent-local";

/** Label for app-messages (latency metrics, transcript events). Used by agents and CallProvider. */
export const APP_MESSAGE_LABEL = "metrics";

// ---------------------------------------------------------------------------
// Prompt template variables
// ---------------------------------------------------------------------------

/**
 * Matches {{ varName }} or {{ varName: default }}.
 * Groups: (1) varName, (2) optional default
 */
const VAR_PLACEHOLDER_RE = /\{\{\s*(\w+)(?:\s*:\s*([^}]*))?\s*\}\}/g;

/** Parse all {{varName}} or {{ varName: default }} tokens. Returns unique names in order of first appearance. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(VAR_PLACEHOLDER_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

/** Replace {{ var }} or {{ var: default }}. Uses vars[key] if set, else inline default, else leaves as-is. */
export function replaceVariables(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(VAR_PLACEHOLDER_RE, (match, key, defaultVal) => {
    const provided = vars[key];
    if (provided !== undefined && provided !== "") return provided;
    const fallback = defaultVal?.trim();
    if (fallback !== undefined && fallback !== "") return fallback;
    return match;
  });
}
