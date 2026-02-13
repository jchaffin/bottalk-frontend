import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

import { DEFAULT_VOICE_1, DEFAULT_VOICE_2, DEFAULT_SCENARIO_SLUG, DEFAULT_TOPIC, PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const DAILY_API_KEY = process.env.DAILY_API_KEY!;


// --- Helpers ---

interface AgentConfig {
  name: string;
  role?: string;
  prompt: string;
  voice_id?: string;
}

async function createDailyRoom(): Promise<{ url: string; name: string }> {
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { exp: Math.floor(Date.now() / 1000) + 600 },
    }),
  });
  if (!res.ok) throw new Error(`Daily room creation failed: ${res.status}`);
  const data = await res.json();
  return { url: data.url, name: data.name };
}

async function getDailyToken(roomName: string): Promise<string> {
  const res = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties: { room_name: roomName } }),
  });
  if (!res.ok) throw new Error(`Daily token creation failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function startPCCSession(
  body: Record<string, unknown>,
): Promise<{ sessionId: string }> {
  const res = await fetch(`${PCC_API}/${PCC_AGENT_NAME}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PCC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PCC session start failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function stopPCCSession(sessionId: string): Promise<void> {
  await fetch(`${PCC_API}/${PCC_AGENT_NAME}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PCC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {}); // best-effort
}

// --- Route handler ---

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    let agents: [AgentConfig, AgentConfig] | undefined = body.agents;

    // Fallback to scenario from DB if no agents array provided
    if (!agents || agents.length < 2 || !agents[0]?.prompt || !agents[1]?.prompt) {
      const scenarioSlug = body.scenario || DEFAULT_SCENARIO_SLUG;
      const topic = body.topic || DEFAULT_TOPIC;

      const scenario = await prisma.scenario.findUnique({
        where: { slug: scenarioSlug },
      });

      if (!scenario) {
        return NextResponse.json(
          { detail: `Unknown scenario: ${scenarioSlug}` },
          { status: 400 },
        );
      }

      const scenarioAgents = scenario.agents as any[];
      const a1 = scenarioAgents[0];
      const a2 = scenarioAgents[1];
      agents = [
        {
          name: a1.name,
          prompt: a1.prompt.replace(/\{\{topic\}\}/g, topic),
          voice_id: a1.voice_id || DEFAULT_VOICE_1,
        },
        {
          name: a2.name,
          prompt: a2.prompt.replace(/\{\{topic\}\}/g, topic),
          voice_id: a2.voice_id || DEFAULT_VOICE_2,
        },
      ];
    }

    const agent1 = agents[0];
    const agent2 = agents[1];
    agent1.voice_id = agent1.voice_id || DEFAULT_VOICE_1;
    agent2.voice_id = agent2.voice_id || DEFAULT_VOICE_2;

    const allNames = [agent1.name, agent2.name];

    // 1. Create a Daily room
    const room = await createDailyRoom();

    // 2. Generate tokens
    const [token1, token2, browserToken] = await Promise.all([
      getDailyToken(room.name),
      getDailyToken(room.name),
      getDailyToken(room.name),
    ]);

    // 3. Start both agents on Pipecat Cloud.
    //    If session2 fails, clean up session1 so we don't leak agents.
    const session1 = await startPCCSession({
      room_url: room.url,
      token: token1,
      name: agent1.name,
      system_prompt: agent1.prompt,
      voice_id: agent1.voice_id,
      goes_first: true,
      known_agents: allNames,
    });

    let session2: { sessionId: string };
    try {
      session2 = await startPCCSession({
        room_url: room.url,
        token: token2,
        name: agent2.name,
        system_prompt: agent2.prompt,
        voice_id: agent2.voice_id,
        goes_first: false,
        known_agents: allNames,
      });
    } catch (err) {
      await stopPCCSession(session1.sessionId);
      throw err;
    }

    // 4. Persist session to DB.
    //    If this fails, clean up both agents so they don't run orphaned.
    try {
      await prisma.session.create({
        data: {
          roomName: room.name,
          roomUrl: room.url,
          agentSessions: [session1.sessionId, session2.sessionId],
        },
      });
    } catch (err) {
      await Promise.allSettled([
        stopPCCSession(session1.sessionId),
        stopPCCSession(session2.sessionId),
      ]);
      throw err;
    }

    return NextResponse.json({ roomUrl: room.url, token: browserToken });
  } catch (err) {
    console.error("POST /api/start error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
