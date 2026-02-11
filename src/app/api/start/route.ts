import { NextResponse } from "next/server";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;
const AGENT_NAME = process.env.PCC_AGENT_NAME || "outrival-agent";
const DAILY_API_KEY = process.env.DAILY_API_KEY!;
const TOPIC = process.env.CONVERSATION_TOPIC || "enterprise software sales";

// --- Agent configs (moved from sarah.py / mike.py) ---

const SARAH_PROMPT = `You are Sarah, an enterprise software sales rep at TechFlow Solutions. \
You are on a live phone call with a potential customer about ${TOPIC}.

Your product — TechFlow — is an AI workflow automation platform that \
integrates with Salesforce, HubSpot, Slack, Jira, and 50+ other tools. \
Professional tier: $99/user/month. 30-day free trial. \
Case study: Acme Corp cut manual work by 60% in 3 months.

Rules:
- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.
- Be warm, curious, empathetic. Ask questions. Handle objections gracefully.
- Goal: understand pain, demo value, propose a free trial or a next call.`;

const MIKE_PROMPT = `You are Mike, VP of Ops at BrightCart, a 200-person e-commerce company. \
A sales rep just called you about ${TOPIC}.

Your pain: manual order processing, poor tool integration, team drowning \
in repetitive tasks. Budget ~$50k/yr. Last year you bought an expensive \
platform that flopped, so you are cautious.

Rules:
- 2-3 short spoken sentences per turn. No bullets, no markdown, no emoji.
- Be interested but skeptical. Push back on price. Ask for proof of ROI.
- Do not agree too quickly. Ask pointed questions about timeline and support.`;

const SARAH_VOICE = process.env.SARAH_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const MIKE_VOICE = process.env.MIKE_VOICE_ID || "TxGEqnHWrfWFTfGW9XjX";

// --- Helpers ---

async function createDailyRoom(): Promise<{ url: string }> {
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        exp: Math.floor(Date.now() / 1000) + 600,
      },
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
    body: JSON.stringify({
      properties: { room_name: roomName },
    }),
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

// Store active session IDs so /api/stop can terminate them.
let activeSessions: string[] = [];

export async function POST() {
  try {
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

    // 3. Start both agents on Pipecat Cloud (in parallel)
    const [sarahSession, mikeSession] = await Promise.all([
      startPCCSession({
        room_url: roomUrl,
        token: sarahToken,
        name: "Sarah",
        system_prompt: SARAH_PROMPT,
        voice_id: SARAH_VOICE,
        goes_first: true,
      }),
      startPCCSession({
        room_url: roomUrl,
        token: mikeToken,
        name: "Mike",
        system_prompt: MIKE_PROMPT,
        voice_id: MIKE_VOICE,
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
