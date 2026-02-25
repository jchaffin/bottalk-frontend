/** Variables that should be shared across both agents (e.g. topic). */
export const SHARED_VARS = ["topic"] as const;

export interface AgentVariables {
  agent1: Record<string, string>;
  agent2: Record<string, string>;
}

/**
 * Sync shared variables across both agents.
 * @param sourceSlot - When provided, use this agent's value as source. Otherwise use agent1 ?? agent2.
 */
export function syncSharedVariables(
  vars: AgentVariables,
  sourceSlot?: "agent1" | "agent2",
): AgentVariables {
  const a1 = { ...vars.agent1 };
  const a2 = { ...vars.agent2 };

  for (const key of SHARED_VARS) {
    const value = sourceSlot
      ? (vars[sourceSlot][key] ?? "").trim()
      : ((a1[key] ?? a2[key] ?? "") as string).trim();
    a1[key] = value;
    a2[key] = value;
  }

  return { agent1: a1, agent2: a2 };
}
