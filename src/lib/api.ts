import { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2 } from "./config";
export { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2 };

// Always call same-origin; /api/start proxies to localhost:8000 when no PCC keys
const AGENT_API = "";

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
  /** The bot being A/B tested (goes first, evaluated by KPIs). */
  system: AgentPrompt;
  /** The user-simulator bot (responds, stays constant across tests). */
  user: AgentPrompt;
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
      throw new Error(`Cannot reach ${target}. Is the dev server running?`);
    }
    throw err;
  }
}

/** Quick start: fetch scenarios, pick default (sales), start conversation. Returns session to pass to /call. */
export async function quickStartConversation(): Promise<{
  roomUrl: string;
  token: string;
  agentSessions?: string[];
  agentNames: [string, string];
  agentColors: [string, string];
  scenarioLabel: string | null;
}> {
  const scenarios = await fetchScenarios();
  const defaultScenario = scenarios.find((s) => s.slug === "sales") ?? scenarios[0];
  if (!defaultScenario) {
    throw new Error("No scenarios. Run: npm run db:seed");
  }
  const promptsResolved = scenarioToPrompts(defaultScenario);
  const variablesResolved = collectDefaults(defaultScenario);
  const fullPrompt1 = systemPromptFromAgent(promptsResolved.system);
  const fullPrompt2 = systemPromptFromAgent(promptsResolved.user);
  const { replaceVariables } = await import("./config");
  const resolvedPrompt1 = replaceVariables(fullPrompt1, variablesResolved.system);
  const resolvedPrompt2 = replaceVariables(fullPrompt2, variablesResolved.user);
  const res = await startConversation({
    agents: [
      { name: promptsResolved.system.name, role: promptsResolved.system.role, prompt: resolvedPrompt1, voice_id: promptsResolved.system.voice_id || DEFAULT_VOICE_1 },
      { name: promptsResolved.user.name, role: promptsResolved.user.role, prompt: resolvedPrompt2, voice_id: promptsResolved.user.voice_id || DEFAULT_VOICE_2 },
    ],
  });
  const { DEFAULT_AGENT_COLORS } = await import("./config");
  return {
    ...res,
    agentNames: [promptsResolved.system.name, promptsResolved.user.name],
    agentColors: DEFAULT_AGENT_COLORS,
    scenarioLabel: defaultScenario.title,
  };
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
  system: Record<string, string>;
  user: Record<string, string>;
}

/** Collect default variable values per agent from a scenario. Topic (call subject) can override scenario title via defaults.topic. */
export function collectDefaults(scenario: Scenario): AgentVariables {
  const shared: Record<string, string> = { topic: scenario.title };
  const systemDefaults = { ...shared, ...(scenario.agents[0]?.defaults ?? {}) };
  const userDefaults = { ...shared, ...(scenario.agents[1]?.defaults ?? {}) };
  return { system: systemDefaults, user: userDefaults };
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

/** Convert a DB scenario into editable prompts (keeps {{variables}} intact). agents[0]=system, agents[1]=user. */
export function scenarioToPrompts(scenario: Scenario): GeneratedPrompts {
  const sys = scenario.agents[0] as AgentPrompt;
  const usr = scenario.agents[1] as AgentPrompt;
  const s1 = splitPromptAndRules(sys);
  const s2 = splitPromptAndRules(usr);
  return {
    system: {
      name: sys.name,
      role: sys.role,
      prompt: s1.prompt,
      rules: s1.rules,
      voice_id: sys.voice_id || voiceForName(sys.name) || DEFAULT_VOICE_1,
      defaults: sys.defaults,
    },
    user: {
      name: usr.name,
      role: usr.role,
      prompt: s2.prompt,
      rules: s2.rules,
      voice_id: usr.voice_id || voiceForName(usr.name) || DEFAULT_VOICE_2,
      defaults: usr.defaults,
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

/** Paginated response for conversations. */
export interface FetchConversationsResponse {
  conversations: SavedConversation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Fetch saved conversations with pagination. */
export async function fetchConversations(opts?: { page?: number; limit?: number }): Promise<FetchConversationsResponse> {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const res = await fetch(`${NEXT_API}/api/transcripts?page=${page}&limit=${limit}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Delete a conversation. */
export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${NEXT_API}/api/transcripts/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
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
