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

export const DEFAULT_SCENARIO_SLUG = "sales";
export const DEFAULT_TOPIC = "enterprise software sales";

export const PCC_AGENT_NAME = "outrival-agent";

/** Label for app-messages (agent transcript events). Must match agents. */
export const APP_MESSAGE_LABEL = "outrival";
