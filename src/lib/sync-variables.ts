/** Variables that should be shared across both agents. */
export const SHARED_VARS = ["topic", "company", "product", "price"] as const;

export interface AgentVariables {
  system: Record<string, string>;
  user: Record<string, string>;
}

/**
 * Sync shared variables across both agents.
 * @param sourceSlot - When provided, use this agent's value as source. Otherwise use system ?? user.
 */
export function syncSharedVariables(
  vars: AgentVariables,
  sourceSlot?: "system" | "user",
): AgentVariables {
  const sys = { ...vars.system };
  const usr = { ...vars.user };

  for (const key of SHARED_VARS) {
    const raw = sourceSlot ? (vars[sourceSlot][key] ?? "") : (sys[key] ?? usr[key] ?? "");
    const value = String(raw).trim();
    if (value) {
      sys[key] = value;
      usr[key] = value;
    }
  }

  return { system: sys, user: usr };
}
