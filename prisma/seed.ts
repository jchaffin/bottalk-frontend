import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client.js";
import { withAccelerate } from "@prisma/extension-accelerate";
import { DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME, DEFAULT_VOICE_1, DEFAULT_VOICE_2 } from "../src/lib/config";

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL!,
}).$extends(withAccelerate());

const DEFAULT_SCENARIOS = [
  {
    slug: "sales",
    title: "Enterprise Software Sales",
    description: "A sales rep pitches an AI workflow platform to a skeptical VP of Ops.",
    builtIn: true,
    agents: [
      {
        name: DEFAULT_AGENT_1_NAME,
        role: "Sales Rep",
        voice_id: DEFAULT_VOICE_1,
        prompt: `You are {{ name }}, an enterprise software sales rep at {{company}}. You are on a live phone call with a potential customer about {{topic}}.\n\nYour product — {{company}} — is an AI workflow automation platform that integrates with Salesforce, HubSpot, Slack, Jira, and 50+ other tools. Professional tier: $99/user/month. 30-day free trial. Case study: Acme Corp cut manual work by 60% in 3 months.`,
        rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- Be warm, curious, empathetic. Ask questions. Handle objections gracefully.\n- Goal: understand pain, demo value, propose a free trial or a next call.\n- When you've reached a natural conclusion (agreed on next steps, or the customer declines), say goodbye and end the call naturally.",
        defaults: { name: DEFAULT_AGENT_1_NAME, company: "bottalk", topic: "enterprise software sales" },
      },
      {
        name: DEFAULT_AGENT_2_NAME,
        role: "Customer",
        voice_id: DEFAULT_VOICE_2,
        prompt: `You are {{ name }}, VP of Ops at {{company}}, a 200-person e-commerce company. A sales rep just called you about {{topic}}.\n\nYour pain: manual order processing, poor tool integration, team drowning in repetitive tasks. Budget ~$50k/yr. Last year you bought an expensive platform that flopped, so you are cautious.`,
        rules: "- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.\n- You are the one being called. Acknowledge and let the caller proceed — do NOT say \"How can I help you?\" or offer to help them.\n- Be interested but skeptical. Push back on price. Ask for proof of ROI.\n- Do not agree too quickly. Ask pointed questions about timeline and support.\n- When you've made a decision (interested or not), wrap up the call naturally and say goodbye.",
        defaults: { name: DEFAULT_AGENT_2_NAME, company: "BrightCart", topic: "enterprise software sales" },
      },
    ],
  },
];

async function main() {
  console.log("Seeding scenarios...");
  for (const s of DEFAULT_SCENARIOS) {
    await prisma.scenario.upsert({
      where: { slug: s.slug },
      update: { title: s.title, description: s.description, agents: s.agents },
      create: s,
    });
    console.log(`  ✓ ${s.slug}`);
  }
  console.log("Seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
