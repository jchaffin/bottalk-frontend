import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

import { DEFAULT_VOICE_1, DEFAULT_VOICE_2, DEFAULT_SCENARIO_SLUG, DEFAULT_TOPIC, PCC_AGENT_NAME, replaceVariables } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY =
  process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;
const PCC_PRIVATE_API_KEY = process.env.PIPECAT_CLOUD_PRIVATE_API_KEY;
const DAILY_API_KEY = process.env.DAILY_API_KEY!;


// --- Helpers ---

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

interface AgentConfig {
  name: string;
  role?: string;
  prompt: string;
  voice_id?: string;
}

function parseAgentConfig(v: unknown): AgentConfig | null {
  if (!isRecord(v)) return null;
  const name = typeof v.name === "string" ? v.name : null;
  const prompt = typeof v.prompt === "string" ? v.prompt : null;
  if (!name || prompt == null) return null;
  const voice_id = typeof v.voice_id === "string" ? v.voice_id : undefined;
  const role = typeof v.role === "string" ? v.role : undefined;
  return { name, prompt, voice_id, role };
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

async function getDailyToken(roomName: string, isOwner = false): Promise<string> {
  const res = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        ...(isOwner ? { is_owner: true } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Daily token creation failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function deleteDailyRoom(roomName: string): Promise<void> {
  await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  }).catch(() => {});
}

type DailyPresenceParticipant = {
  userName?: string;
  session_id?: string;
};

async function waitForDailyParticipants(
  roomName: string,
  requiredNames: string[],
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const required = new Set(requiredNames.filter(Boolean));

  // Presence snapshots can lag; poll a few times with small delay.
  while (Date.now() < deadline) {
    const res = await fetch(`https://api.daily.co/v1/rooms/${roomName}/presence`, {
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      cache: "no-store",
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);

    if (res && res.ok) {
      const raw = (await res.json().catch(() => null)) as unknown;
      const participants: DailyPresenceParticipant[] =
        isRecord(raw) && Array.isArray(raw.participants)
          ? (raw.participants as DailyPresenceParticipant[])
          : [];
      const presentNames = new Set(
        participants
          .map((p) => p?.userName)
          .filter((n): n is string => typeof n === "string" && n.length > 0),
      );

      let allPresent = true;
      for (const n of required) {
        if (!presentNames.has(n)) {
          allPresent = false;
          break;
        }
      }
      if (allPresent) return;
    }

    await new Promise((r) => setTimeout(r, 750));
  }
}

function isPccAtCapacityError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return (
    msg.includes("PCC-AGENT-AT-CAPACITY") ||
    msg.includes("maximum instances reached") ||
    msg.includes("PCC session start failed (429)")
  );
}

async function cleanupAllActiveSessions(): Promise<void> {
  // Best-effort cleanup used when PCC reports capacity reached.
  type SessionRow = { id: string; agentSessions: string[]; roomName: string };
  const sessions: SessionRow[] = await prisma.session.findMany().catch(() => [] as SessionRow[]);
  if (sessions.length === 0) return;

  const allAgentSessionIds = sessions.flatMap((s) => s.agentSessions);
  const allRoomNames = sessions.map((s) => s.roomName);

  await Promise.allSettled(allAgentSessionIds.map(stopPCCSession));

  await Promise.allSettled(allRoomNames.map(deleteDailyRoom));

  await prisma.session.deleteMany({
    where: { id: { in: sessions.map((s) => s.id) } },
  }).catch(() => {});
}

async function startPCCSession(
  body: Record<string, unknown>,
): Promise<{ sessionId: string }> {
  if (!PCC_API_KEY) {
    throw new Error("Missing PIPECAT_CLOUD_PUBLIC_API_KEY (or PIPECAT_CLOUD_API_KEY)");
  }
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
  // Official API: Private stop endpoint
  // DELETE /v1/agents/{agentName}/sessions/{sessionId} with a private key.
  if (PCC_PRIVATE_API_KEY) {
    await fetch(`https://api.pipecat.daily.co/v1/agents/${PCC_AGENT_NAME}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${PCC_PRIVATE_API_KEY}` },
    }).catch(() => {});
    return;
  }

  // Fallback (legacy/undocumented): best-effort stop via public API if available.
  if (!PCC_API_KEY) return;
  await fetch(`${PCC_API}/${PCC_AGENT_NAME}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PCC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

// --- Route handler ---

export async function POST(request: NextRequest) {
  try {
    const rawBody = (await request.json().catch(() => null)) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};

    // Always clear any previous runs before starting a new one.
    // This prevents PCC-AGENT-AT-CAPACITY when sessions/rooms were leaked
    // (refreshes, crashes, or users hammering Start).
    await cleanupAllActiveSessions();

    let agents: [AgentConfig, AgentConfig] | undefined;
    if (Array.isArray(body.agents) && body.agents.length >= 2) {
      const a1 = parseAgentConfig(body.agents[0]);
      const a2 = parseAgentConfig(body.agents[1]);
      if (a1 && a2) agents = [a1, a2];
    }

    // Fallback to scenario from DB if no agents array provided
    if (!agents || agents.length < 2 || !agents[0]?.prompt || !agents[1]?.prompt) {
      const scenarioSlug =
        typeof body.scenario === "string" ? body.scenario : DEFAULT_SCENARIO_SLUG;
      const topic = typeof body.topic === "string" ? body.topic : DEFAULT_TOPIC;

      const scenario = await prisma.scenario.findUnique({
        where: { slug: scenarioSlug },
      }).catch(() => null);

      if (scenario) {
        const scenarioAgents = Array.isArray(scenario.agents)
          ? (scenario.agents as unknown[])
          : [];
        const a1 = isRecord(scenarioAgents[0]) ? scenarioAgents[0] : {};
        const a2 = isRecord(scenarioAgents[1]) ? scenarioAgents[1] : {};
        const shared = { topic };
        agents = [
          {
            name: typeof a1.name === "string" ? a1.name : "Sarah",
            prompt: replaceVariables(
              typeof a1.prompt === "string" ? a1.prompt : "",
              { ...shared, ...(isRecord(a1.defaults) ? a1.defaults : {}) },
            ),
            voice_id: typeof a1.voice_id === "string" ? a1.voice_id : DEFAULT_VOICE_1,
          },
          {
            name: typeof a2.name === "string" ? a2.name : "Mike",
            prompt: replaceVariables(
              typeof a2.prompt === "string" ? a2.prompt : "",
              { ...shared, ...(isRecord(a2.defaults) ? a2.defaults : {}) },
            ),
            voice_id: typeof a2.voice_id === "string" ? a2.voice_id : DEFAULT_VOICE_2,
          },
        ];
      } else {
        // No prompts and no DB scenario — use name-only agents.
        // The PCC bot has baked-in defaults for Sarah & Mike.
        agents = [
          { name: "Sarah", prompt: "", voice_id: DEFAULT_VOICE_1 },
          { name: "Mike", prompt: "", voice_id: DEFAULT_VOICE_2 },
        ];
      }
    }

    const agent1 = agents[0];
    const agent2 = agents[1];
    agent1.voice_id = agent1.voice_id || DEFAULT_VOICE_1;
    agent2.voice_id = agent2.voice_id || DEFAULT_VOICE_2;

    const allNames = [agent1.name, agent2.name];

    // Max LLM turns per agent — hard ceiling to prevent runaway API usage.
    const maxTurns = 20;

    type StartPayload = { roomUrl: string; token: string; agentSessions: string[] };

    async function attemptStartOnce(): Promise<StartPayload> {
      // 1. Create a Daily room
      const room = await createDailyRoom();

      try {
        // 2. Generate tokens
        // Agent 1 (goes_first) needs is_owner to call start_transcription.
        const [token1, token2, browserToken] = await Promise.all([
          getDailyToken(room.name, true),
          getDailyToken(room.name),
          getDailyToken(room.name, true), // browser needs owner to start/receive transcription
        ]);

        // 3. Start both agents on Pipecat Cloud.
        //    If session2 fails, clean up session1 so we don't leak agents.
        const session1 = await startPCCSession({
          room_url: room.url,
          token: token1,
          name: agent1.name,
          ...(agent1.prompt ? { system_prompt: agent1.prompt } : {}),
          ...(agent1.voice_id ? { voice_id: agent1.voice_id } : {}),
          goes_first: true,
          known_agents: allNames,
          max_turns: maxTurns,
        });

        let session2: { sessionId: string };
        try {
          session2 = await startPCCSession({
            room_url: room.url,
            token: token2,
            name: agent2.name,
            ...(agent2.prompt ? { system_prompt: agent2.prompt } : {}),
            ...(agent2.voice_id ? { voice_id: agent2.voice_id } : {}),
            goes_first: false,
            known_agents: allNames,
            max_turns: maxTurns,
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

        return {
          roomUrl: room.url,
          token: browserToken,
          agentSessions: [session1.sessionId, session2.sessionId],
        };
      } catch (err) {
        // Avoid leaking Daily rooms if PCC fails.
        await deleteDailyRoom(room.name);
        throw err;
      }
    }

    async function startWithReadiness(): Promise<StartPayload> {
      const payload = await attemptStartOnce();
      const roomName = payload.roomUrl
        ? payload.roomUrl.replace(/\/+$/, "").split("/").pop() || ""
        : "";
      if (roomName) {
        await waitForDailyParticipants(roomName, allNames, 15_000).catch(() => {});
      }
      return payload;
    }

    try {
      const payload = await startWithReadiness();
      return NextResponse.json(payload);
    } catch (err) {
      if (isPccAtCapacityError(err)) {
        await cleanupAllActiveSessions();
        await new Promise((r) => setTimeout(r, 1500));
        const payload = await startWithReadiness();
        return NextResponse.json(payload);
      }
      throw err;
    }
  } catch (err) {
    console.error("POST /api/start error:", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
