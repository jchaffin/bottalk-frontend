import { NextRequest, NextResponse } from "next/server";
import scenarioData from "../../../lib/scenarios.json";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const AGENT_NAME = process.env.PCC_AGENT_NAME || "outrival-agent";
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

const DEFAULT_VOICE_1 = process.env.DEFAULT_VOICE_1 || "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_VOICE_2 = process.env.DEFAULT_VOICE_2 || "TxGEqnHWrfWFTfGW9XjX";

// --- Helpers ---

interface AgentConfig {
  name: string;
  role?: string;
  prompt: string;
  voice_id?: string;
}

async function createDailyRoom(): Promise<{ url: string }> {
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
  return res.json();
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
  const res = await fetch(`${PCC_API}/${AGENT_NAME}/start`, {
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

// --- Route handler ---

let activeSessions: string[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    let agents: [AgentConfig, AgentConfig] | undefined = body.agents;

    // Fallback to scenario templates if no agents array provided
    if (!agents || agents.length < 2 || !agents[0]?.prompt || !agents[1]?.prompt) {
      const scenarioKey = body.scenario || scenarioData.default;
      const topic = body.topic || "enterprise software sales";
      const scenarios = scenarioData.scenarios as Record<string, any>;
      const scenario = scenarios[scenarioKey];

      if (!scenario) {
        return NextResponse.json(
          { detail: `Unknown scenario: ${scenarioKey}` },
          { status: 400 },
        );
      }

      const a1 = scenario.agents[0];
      const a2 = scenario.agents[1];
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
    const roomUrl = room.url;
    const roomName = roomUrl.split("/").pop()!;

    // 2. Generate tokens
    const [token1, token2, browserToken] = await Promise.all([
      getDailyToken(roomName),
      getDailyToken(roomName),
      getDailyToken(roomName),
    ]);

    // 3. Start both agents on Pipecat Cloud.
    //    Agent 1 goes first (starts transcription), agent 2 follows.
    const session1 = await startPCCSession({
      room_url: roomUrl,
      token: token1,
      name: agent1.name,
      system_prompt: agent1.prompt,
      voice_id: agent1.voice_id,
      goes_first: true,
      known_agents: allNames,
    });

    const session2 = await startPCCSession({
      room_url: roomUrl,
      token: token2,
      name: agent2.name,
      system_prompt: agent2.prompt,
      voice_id: agent2.voice_id,
      goes_first: false,
      known_agents: allNames,
    });

    activeSessions = [session1.sessionId, session2.sessionId];

    return NextResponse.json({ roomUrl, token: browserToken });
  } catch (err) {
    console.error("POST /api/start error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
