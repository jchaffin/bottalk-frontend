import { PrismaClient } from "@/generated/prisma/client";
import type { ScenarioModel } from "@/generated/prisma/models/Scenario";
import { withAccelerate } from "@prisma/extension-accelerate";
import { DEFAULT_VOICE_1, DEFAULT_VOICE_2, DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME } from "./config";
import type { Scenario } from "./api";

let cachedScenarios: Scenario[] | null = null;

/**
 * Fallback scenarios when database is not available (e.g., build, Accelerate down).
 * Keep this in sync with the seed data.
 */
export function getFallbackScenarios(): Scenario[] {
  return [
    {
      id: "sales",
      slug: "sales",
      title: "Enterprise Software Sales",
      description: "A sales rep pitches an AI workflow platform to a skeptical VP of Ops.",
      builtIn: true,
      agents: [
        {
          name: DEFAULT_AGENT_1_NAME,
          role: "Sales Rep",
          voice_id: DEFAULT_VOICE_1,
          prompt: "You are {{ name }}, an enterprise software sales rep at {{company}}. You are on a live phone call with a potential customer about {{topic}}.\n\nYour product — {{company}} — is an AI workflow automation platform that integrates with Salesforce, HubSpot, Slack, Jira, and 50+ other tools. Professional tier: $99/user/month. 30-day free trial. Case study: Acme Corp cut manual work by 60% in 3 months.",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Be warm, curious, empathetic. Ask questions. Handle objections gracefully.\n- Goal: understand pain, demo value, propose a free trial or a next call.\n- When you've reached a natural conclusion (agreed on next steps, or the customer declines), say goodbye and end the call naturally.",
          defaults: {
            name: DEFAULT_AGENT_1_NAME,
            company: "bottalk",
            topic: "enterprise software sales",
          },
        },
        {
          name: DEFAULT_AGENT_2_NAME,
          role: "Customer",
          voice_id: DEFAULT_VOICE_2,
          prompt: "You are {{ name }}, VP of Ops at {{company}}, a 200-person e-commerce company. A sales rep just called you about {{topic}}.\n\nYour pain: manual order processing, poor tool integration, team drowning in repetitive tasks. Budget ~$50k/yr. Last year you bought an expensive platform that flopped, so you are cautious.",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Be interested but skeptical. Push back on price. Ask for proof of ROI.\n- Do not agree too quickly. Ask pointed questions about timeline and support.\n- When you've made a decision (interested or not), wrap up the call naturally and say goodbye.",
          defaults: {
            name: DEFAULT_AGENT_2_NAME,
            company: "BrightCart",
            topic: "enterprise software sales",
          },
        },
      ],
    },
    {
      id: "support",
      slug: "support",
      title: "Customer Support Call",
      description: "A support agent handles a frustrated customer call about a billing issue.",
      builtIn: true,
      agents: [
        {
          name: DEFAULT_AGENT_1_NAME,
          role: "Support Agent",
          voice_id: DEFAULT_VOICE_1,
          prompt: "You are {{ name }}, a customer support agent at {{company}}. You are on a live phone call with a customer about {{topic}}.\n\nYou have access to the customer's account and can look up billing details, subscription status, and recent tickets. You can offer credits, plan changes, or escalation to a supervisor.",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Be empathetic, patient, and solution-oriented.\n- Goal: resolve the issue on the first call, retain the customer.\n- Once the issue is resolved and the customer is satisfied, confirm next steps and say goodbye.",
          defaults: {
            name: DEFAULT_AGENT_1_NAME,
            company: "bottalk",
            topic: "a billing issue",
          },
        },
        {
          name: DEFAULT_AGENT_2_NAME,
          role: "Customer",
          voice_id: DEFAULT_VOICE_2,
          prompt: "You are {{ name }}, a customer of {{company}}. You are calling about {{topic}}.\n\n{{issue_description}}",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Start frustrated but warm up gradually if the agent is helpful.\n- Ask for specific timelines and confirmation numbers.",
          defaults: {
            name: DEFAULT_AGENT_2_NAME,
            company: "bottalk",
            topic: "a billing issue",
            issue_description: "You were charged twice last month and have been waiting 3 days for a refund. You're frustrated because you've already emailed support with no response.",
          },
        },
      ],
    },
    {
      id: "discovery",
      slug: "discovery",
      title: "Product Discovery Call",
      description: "An account executive runs a discovery call to understand a prospect's needs.",
      builtIn: true,
      agents: [
        {
          name: DEFAULT_AGENT_1_NAME,
          role: "Account Executive",
          voice_id: DEFAULT_VOICE_1,
          prompt: "You are {{ name }}, an account executive at {{company}}. You are on a discovery call with a prospect about {{topic}}.\n\nYour goal is to understand the prospect's current tools, pain points, team size, budget, and timeline before scheduling a demo. You should NOT pitch the product yet — just listen and ask smart questions.",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Ask open-ended questions. Mirror back what you hear.\n- Goal: qualify the lead and book a demo.",
          defaults: {
            name: DEFAULT_AGENT_1_NAME,
            company: "bottalk",
            topic: "workflow automation",
          },
        },
        {
          name: DEFAULT_AGENT_2_NAME,
          role: "Prospect",
          voice_id: DEFAULT_VOICE_2,
          prompt: "You are {{ name }}, Director of Operations at a mid-size logistics company. A sales rep called about {{topic}}.\n\nYou're currently using spreadsheets and Zapier for workflow automation. Your team of 15 is overwhelmed. Budget is flexible if ROI is clear. You're evaluating 2-3 vendors.",
          rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Be open but don't volunteer information unless asked.\n- Ask what makes them different from competitors.",
          defaults: {
            name: DEFAULT_AGENT_2_NAME,
            topic: "workflow automation",
          },
        },
      ],
    },
  ];
}

/**
 * Get scenarios from database and cache them.
 * In production builds, this runs once at build time.
 * In development, it runs on first request and caches.
 */
async function getStaticScenarios(): Promise<Scenario[]> {
  if (cachedScenarios) {
    return cachedScenarios;
  }

  // If no database URL, return hardcoded scenarios for build time
  if (!process.env.PRISMA_DATABASE_URL) {
    console.warn("PRISMA_DATABASE_URL not available, using fallback scenarios");
    return getFallbackScenarios();
  }

  try {
    const prisma = new PrismaClient({
      accelerateUrl: process.env.PRISMA_DATABASE_URL,
    }).$extends(withAccelerate());

    const scenarios = await prisma.scenario.findMany({
      where: { builtIn: true },
      orderBy: { id: "asc" },
    });

    cachedScenarios = scenarios.map((s: ScenarioModel): Scenario => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      description: s.description,
      builtIn: s.builtIn,
      agents: Array.isArray(s.agents) ? (s.agents as unknown as Scenario["agents"]) : [],
    }));

    await prisma.$disconnect();
    return cachedScenarios!;
  } catch (error) {
    console.error("Failed to load static scenarios:", error);
    cachedScenarios = getFallbackScenarios();
    return cachedScenarios;
  }
}

export { getStaticScenarios };