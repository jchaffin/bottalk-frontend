import prisma from "@/lib/prisma";
import {
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
  DEFAULT_AGENT_1_NAME,
  DEFAULT_AGENT_2_NAME,
  DEFAULT_SCENARIO_SLUG,
  DEFAULT_TOPIC,
  replaceVariables,
} from "@/lib/config";
import { syncSharedVariables } from "@/lib/sync-variables";

export interface AgentConfig {
  name: string;
  prompt: string;
  voice_id: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseAgent(v: unknown): AgentConfig | null {
  if (!isRecord(v)) return null;
  const name = typeof v.name === "string" ? v.name : null;
  const prompt = typeof v.prompt === "string" ? v.prompt : null;
  if (!name || prompt == null) return null;
  return {
    name,
    prompt,
    voice_id: typeof v.voice_id === "string" ? v.voice_id : DEFAULT_VOICE_1,
  };
}

export async function resolveAgents(body: Record<string, unknown>): Promise<[AgentConfig, AgentConfig]> {
  const agents = body.agents;
  if (Array.isArray(agents) && agents.length >= 2) {
    const a1 = parseAgent(agents[0]);
    const a2 = parseAgent(agents[1]);
    if (a1 && a2 && a1.prompt && a2.prompt) {
      return [
        { ...a1, voice_id: a1.voice_id || DEFAULT_VOICE_1 },
        { ...a2, voice_id: a2.voice_id || DEFAULT_VOICE_2 },
      ];
    }
  }

  const hasScenario = typeof body.scenario === "string" && body.scenario.length > 0;
  const hasTopic = typeof body.topic === "string" && body.topic.length > 0;
  if (!hasScenario && !hasTopic) {
    return [
      { name: DEFAULT_AGENT_1_NAME, prompt: "", voice_id: DEFAULT_VOICE_1 },
      { name: DEFAULT_AGENT_2_NAME, prompt: "", voice_id: DEFAULT_VOICE_2 },
    ];
  }

  const scenarioSlug = hasScenario ? body.scenario : DEFAULT_SCENARIO_SLUG;
  const topic = hasTopic ? body.topic : DEFAULT_TOPIC;

  const scenario = await prisma.scenario.findUnique({
    where: { slug: scenarioSlug },
  }).catch(() => null);

  if (scenario && Array.isArray(scenario.agents)) {
    const a1 = isRecord(scenario.agents[0]) ? scenario.agents[0] : {};
    const a2 = isRecord(scenario.agents[1]) ? scenario.agents[1] : {};
    const vars = syncSharedVariables({
      agent1: { topic, ...(isRecord(a1.defaults) ? a1.defaults : {}) },
      agent2: { topic, ...(isRecord(a2.defaults) ? a2.defaults : {}) },
    });
    const p1 = typeof a1.prompt === "string" ? a1.prompt : "";
    const r1 = typeof a1.rules === "string" ? a1.rules : "";
    const p2 = typeof a2.prompt === "string" ? a2.prompt : "";
    const r2 = typeof a2.rules === "string" ? a2.rules : "";
    const fullPrompt1 = r1 ? `${p1}\n\nRules:\n${r1}` : p1;
    const fullPrompt2 = r2 ? `${p2}\n\nRules:\n${r2}` : p2;
    return [
      {
        name: typeof a1.name === "string" ? a1.name : DEFAULT_AGENT_1_NAME,
        prompt: replaceVariables(fullPrompt1, vars.agent1),
        voice_id: typeof a1.voice_id === "string" ? a1.voice_id : DEFAULT_VOICE_1,
      },
      {
        name: typeof a2.name === "string" ? a2.name : DEFAULT_AGENT_2_NAME,
        prompt: replaceVariables(fullPrompt2, vars.agent2),
        voice_id: typeof a2.voice_id === "string" ? a2.voice_id : DEFAULT_VOICE_2,
      },
    ];
  }

  return [
    { name: DEFAULT_AGENT_1_NAME, prompt: "", voice_id: DEFAULT_VOICE_1 },
    { name: DEFAULT_AGENT_2_NAME, prompt: "", voice_id: DEFAULT_VOICE_2 },
  ];
}
