/** Variables that should be shared across both agents (e.g. topic). */
export const SHARED_VARS = ["topic"] as const;

export interface AgentVariables {
  agent1: Record<string, string>;
  agent2: Record<string, string>;
}

/**
 * Sync shared variables (topic, etc.) across both agents.
 * Uses agent1 as source of truth when both have values.
 */
export function syncSharedVariables(vars: AgentVariables): AgentVariables {
  const a1 = { ...vars.agent1 };
  const a2 = { ...vars.agent2 };

  for (const key of SHARED_VARS) {
    const v1 = a1[key];
    const v2 = a2[key];
    const synced = (v1 ?? v2 ?? "").trim();
    a1[key] = synced;
    a2[key] = synced;
  }

  return { agent1: a1, agent2: a2 };
}
