// Local dev: set NEXT_PUBLIC_API_URL=http://localhost:8000 to hit dev.py
// Production (Vercel): leave unset, calls same-origin API routes
const AGENT_API = process.env.NEXT_PUBLIC_API_URL || "";

// Generate-prompts always runs on the Next.js server (not dev.py)
const NEXT_API = "";

export interface StartResponse {
  roomUrl: string;
  token: string;
}

export interface TranscriptLine {
  id: number;
  speaker: string;
  text: string;
  interim?: boolean;
}

export interface AgentPrompt {
  name: string;
  role: string;
  prompt: string;
  voice_id?: string;
}

export interface GeneratedPrompts {
  agent1: AgentPrompt;
  agent2: AgentPrompt;
}

export interface StartOptions {
  agents: [AgentPrompt, AgentPrompt];
}

/** Available voice presets. */
export const VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Sarah",  label: "Sarah (Female)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Mike",   label: "Mike (Male)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  label: "Bella (Female)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", label: "Antoni (Male)" },
] as const;

export const DEFAULT_VOICE_1 = VOICES[0].id;
export const DEFAULT_VOICE_2 = VOICES[1].id;

/** Find the best voice for an agent name. Case-insensitive match. */
export function voiceForName(name: string): string | undefined {
  const lower = name.toLowerCase();
  return VOICES.find((v) => v.name.toLowerCase() === lower)?.id;
}

/** Find the voice preset name for a given voice ID. */
export function nameForVoice(voiceId: string): string | undefined {
  return VOICES.find((v) => v.id === voiceId)?.name;
}

/** Ask the LLM to generate role + prompt pairs for a given topic. */
export async function generatePrompts(topic: string): Promise<GeneratedPrompts> {
  const res = await fetch(`${NEXT_API}/api/generate-prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Create a Daily room and spawn agents. */
export async function startConversation(options: StartOptions): Promise<StartResponse> {
  const res = await fetch(`${AGENT_API}/api/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Terminate running agent sessions. */
export async function stopConversation(): Promise<void> {
  await fetch(`${AGENT_API}/api/stop`, { method: "POST" });
}
