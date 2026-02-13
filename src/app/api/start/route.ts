import { NextRequest, NextResponse } from "next/server";
import scenarioData from "../../../lib/scenarios.json";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const AGENT_NAME = process.env.PCC_AGENT_NAME || "outrival-agent";
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

// --- Helpers ---

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

    // Custom prompts (from LLM generate flow)
    let sarahPrompt = body.sarah_prompt as string | undefined;
    let mikePrompt = body.mike_prompt as string | undefined;
    let sarahVoice = body.sarah_voice_id as string | undefined;
    let mikeVoice = body.mike_voice_id as string | undefined;

    // Fallback to scenario templates if no custom prompts
    if (!sarahPrompt || !mikePrompt) {
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

      const sarah = scenario.agents.find((a: any) => a.name === "Sarah");
      const mike = scenario.agents.find((a: any) => a.name === "Mike");
      sarahPrompt = sarah.prompt.replace(/\{\{topic\}\}/g, topic);
      mikePrompt = mike.prompt.replace(/\{\{topic\}\}/g, topic);
      sarahVoice = sarahVoice || sarah.voice_id;
      mikeVoice = mikeVoice || mike.voice_id;
    }

    sarahVoice = sarahVoice || process.env.SARAH_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    mikeVoice = mikeVoice || process.env.MIKE_VOICE_ID || "TxGEqnHWrfWFTfGW9XjX";

    // 1. Create a Daily room
    const room = await createDailyRoom();
    const roomUrl = room.url;
    const roomName = roomUrl.split("/").pop()!;

    // 2. Generate tokens
    const [sarahToken, mikeToken, browserToken] = await Promise.all([
      getDailyToken(roomName),
      getDailyToken(roomName),
      getDailyToken(roomName),
    ]);

    // 3. Start both agents on Pipecat Cloud
    const [sarahSession, mikeSession] = await Promise.all([
      startPCCSession({
        room_url: roomUrl,
        token: sarahToken,
        name: "Sarah",
        system_prompt: sarahPrompt,
        voice_id: sarahVoice,
        goes_first: true,
      }),
      startPCCSession({
        room_url: roomUrl,
        token: mikeToken,
        name: "Mike",
        system_prompt: mikePrompt,
        voice_id: mikeVoice,
        goes_first: false,
      }),
    ]);

    activeSessions = [sarahSession.sessionId, mikeSession.sessionId];

    return NextResponse.json({ roomUrl, token: browserToken });
  } catch (err) {
    console.error("POST /api/start error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
