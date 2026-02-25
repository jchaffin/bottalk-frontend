/**
 * Default prompt template for Quick Start. Matches agents/config.py.
 * When user clicks Quick Start, we resolve these with defaults (DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME, bottalk)
 * and send to the backend — no prompt editor required.
 */

import { DEFAULT_VOICE_1, DEFAULT_VOICE_2, DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME } from "./config";
import type { Scenario } from "./api";

function getDefaultSystemPrompt(): string {
  return `You are {{ name: ${DEFAULT_AGENT_1_NAME} }} an {{ role: enterprise software sales rep }} at {{ company: bottalk }}. You are on a live phone call with a potential customer about {{ topic: enterprise software sales }}.

Your product — {{ company: bottalk }} — is an AI workflow automation platform that integrates with Salesforce, HubSpot, Slack, Jira, and 50+ other tools. Professional tier: $99/user/month. 30-day free trial. Case study: Acme Corp cut manual work by 60% in 3 months.`;
}

function getDefaultUserPrompt(): string {
  return `You are {{ name: ${DEFAULT_AGENT_2_NAME} }}, {{ role: VP of Ops }} at {{ company: BrightCart }}, a 200-person e-commerce company. A sales rep just called you about {{ topic: enterprise software sales }}.

Your pain: manual order processing, poor tool integration, team drowning in repetitive tasks. Budget ~$50k/yr. Last year you bought an expensive platform that flopped, so you are cautious.`;
}

/** Default scenario for Quick Start — sends resolved prompts without showing editor. */
export function getDefaultScenario(): Scenario {
  return {
    id: "default",
    slug: "default",
    title: `Quick Start — ${DEFAULT_AGENT_1_NAME} & ${DEFAULT_AGENT_2_NAME}`,
    description: `${DEFAULT_AGENT_1_NAME} (sales rep at bottalk) talks to ${DEFAULT_AGENT_2_NAME} (skeptical VP of Ops).`,
    builtIn: true,
    agents: [
      {
        name: DEFAULT_AGENT_1_NAME,
        role: "Sales Rep",
        voice_id: DEFAULT_VOICE_1,
        prompt: getDefaultSystemPrompt(),
        defaults: {
          name: DEFAULT_AGENT_1_NAME,
          role: "enterprise software sales rep",
          company: "bottalk",
          topic: "enterprise software sales",
        },
      },
      {
        name: DEFAULT_AGENT_2_NAME,
        role: "Customer",
        voice_id: DEFAULT_VOICE_2,
        prompt: getDefaultUserPrompt(),
        defaults: {
          name: DEFAULT_AGENT_2_NAME,
          role: "VP of Ops",
          company: "BrightCart",
          topic: "enterprise software sales",
        },
      },
    ],
  };
}
