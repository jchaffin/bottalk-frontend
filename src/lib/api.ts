import { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2 } from "./config";
export { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2 };

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
  defaults?: Record<string, string>;
}

export interface GeneratedPrompts {
  agent1: AgentPrompt;
  agent2: AgentPrompt;
}

export interface StartOptions {
  agents: [AgentPrompt, AgentPrompt];
}

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
  const res = await fetch(`${NEXT_API}/api/generate`, {
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

/** A scenario as stored in the database. */
export interface Scenario {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  builtIn: boolean;
  agents: AgentPrompt[];
}

/** Fetch all scenarios from the DB. */
export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${NEXT_API}/api/scenarios`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

export interface SavedConversation {
  id: string;
  title: string;
  agentNames: string[];
  lines: { speaker: string; text: string }[];
  createdAt: string;
}

/** Save a conversation transcript. */
export async function saveTranscript(
  data: { title: string; agentNames: string[]; lines: { speaker: string; text: string }[] },
): Promise<SavedConversation> {
  const res = await fetch(`${NEXT_API}/api/transcripts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Fetch saved conversations. */
export async function fetchConversations(): Promise<SavedConversation[]> {
  const res = await fetch(`${NEXT_API}/api/transcripts`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Fetch a single conversation by ID. */
export async function fetchConversation(id: string): Promise<SavedConversation> {
  const res = await fetch(`${NEXT_API}/api/transcripts/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}
