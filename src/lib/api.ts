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
  agentSessions?: string[];
}

export interface TranscriptLine {
  id: number;
  speaker: string;
  text: string;
  interim?: boolean;
  /** Per-turn latency metrics attached when this line came from a WS turn event. */
  metrics?: {
    ttfb?: number;
    llm?: number;
    tts?: number;
    e2e?: number;
  };
  /** True if this turn was an interruption (user spoke over the bot). */
  interrupted?: boolean;
  /** KPI annotation from real-time classification. role: agent = evaluated bot, user = counterpart bot (both bots). */
  annotation?: {
    role?: "agent" | "user";
    label: string;
    sentiment: "positive" | "neutral" | "negative";
    relevantKpis: string[];
  };
}

export interface AgentPrompt {
  name: string;
  role: string;
  prompt: string;
  rules?: string;
  voice_id?: string;
  defaults?: Record<string, string>;
}

/** Combine prompt and rules for the backend system_prompt. */
export function systemPromptFromAgent(p: AgentPrompt): string {
  if (p.rules?.trim()) {
    return `${p.prompt.trim()}\n\nRules:\n${p.rules.trim()}`;
  }
  return p.prompt.trim();
}

export interface GeneratedPrompts {
  agent1: AgentPrompt;
  agent2: AgentPrompt;
}

export interface StartOptions {
  agents: [AgentPrompt, AgentPrompt];
}

function agentTarget(path: string): string {
  return `${AGENT_API}${path}`;
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
  const target = agentTarget("/api/start");
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `API error ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach ${target}. Check NEXT_PUBLIC_API_URL or local API server.`);
    }
    throw err;
  }
}

/** Quick-start a call using the baked-in System & User defaults — no prompts needed. */
export async function startQuickCall(): Promise<StartResponse> {
  const target = agentTarget("/api/start");
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `API error ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach ${target}. Check NEXT_PUBLIC_API_URL or local API server.`);
    }
    throw err;
  }
}

/** Terminate running agent sessions. */
export async function stopConversation(): Promise<void> {
  // Best-effort stop; avoid blocking UI transitions.
  fetch(agentTarget("/api/stop"), { method: "POST", keepalive: true }).catch(() => {});
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

/** Per-agent variable maps. */
export interface AgentVariables {
  agent1: Record<string, string>;
  agent2: Record<string, string>;
}

/** Sync shared variables (topic, etc.) across both agents via backend. */
export async function syncVariables(vars: AgentVariables): Promise<AgentVariables> {
  const res = await fetch(`${NEXT_API}/api/sync-variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Collect default variable values per agent from a scenario. Topic (call subject) can override scenario title via defaults.topic. */
export function collectDefaults(scenario: Scenario): AgentVariables {
  const shared: Record<string, string> = { topic: scenario.title };
  const a1Defaults = { ...shared, ...(scenario.agents[0]?.defaults ?? {}) };
  const a2Defaults = { ...shared, ...(scenario.agents[1]?.defaults ?? {}) };
  return { agent1: a1Defaults, agent2: a2Defaults };
}

/** Split legacy prompt (with embedded Rules) into prompt + rules for display. */
export function splitPromptAndRules(agent: AgentPrompt): { prompt: string; rules: string } {
  if (agent.rules !== undefined && agent.rules !== "") {
    return { prompt: agent.prompt, rules: agent.rules };
  }
  const idx = agent.prompt.indexOf("\n\nRules:\n");
  if (idx >= 0) {
    return {
      prompt: agent.prompt.slice(0, idx).trim(),
      rules: agent.prompt.slice(idx + 9).trim(),
    };
  }
  return { prompt: agent.prompt, rules: "" };
}

/** Convert a DB scenario into editable prompts (keeps {{variables}} intact). */
export function scenarioToPrompts(scenario: Scenario): GeneratedPrompts {
  const a1 = scenario.agents[0] as AgentPrompt;
  const a2 = scenario.agents[1] as AgentPrompt;
  const s1 = splitPromptAndRules(a1);
  const s2 = splitPromptAndRules(a2);
  return {
    agent1: {
      name: a1.name,
      role: a1.role,
      prompt: s1.prompt,
      rules: s1.rules,
      voice_id: a1.voice_id || voiceForName(a1.name) || DEFAULT_VOICE_1,
      defaults: a1.defaults,
    },
    agent2: {
      name: a2.name,
      role: a2.role,
      prompt: s2.prompt,
      rules: s2.rules,
      voice_id: a2.voice_id || voiceForName(a2.name) || DEFAULT_VOICE_2,
      defaults: a2.defaults,
    },
  };
}

export interface SavedConversation {
  id: string;
  title: string;
  agentNames: string[];
  lines: { speaker: string; text: string }[];
  roomUrl?: string | null;
  latencyMetrics?: LatencyMetric[] | null;
  createdAt: string;
}

export type LatencyMetric = {
  agent: string;
  turn?: number;
  ttfb?: number;
  llm?: number;
  tts?: number;
  e2e?: number;
  ts?: number;
};

/** Save a conversation transcript. */
export async function saveTranscript(
  data: {
    title: string;
    agentNames: string[];
    lines: { speaker: string; text: string }[];
    roomUrl?: string;
    latencyMetrics?: LatencyMetric[];
  },
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
