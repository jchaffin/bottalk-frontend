import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DEFAULT_VOICE_1, DEFAULT_VOICE_2, PCC_AGENT_NAME } from "@/lib/config";
import { localAgentBaseUrl, shouldUseLocalAgentServer } from "@/lib/agent-backend";
import { resolveAgents } from "@/lib/resolve-agents";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;
const PCC_PRIVATE_KEY = process.env.PCC_PRIVATE_KEY;
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function dailyFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`https://api.daily.co/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`Daily API error: ${res.status}`);
  return res.json();
}

async function startPCCSession(body: Record<string, unknown>): Promise<{ sessionId: string }> {
  if (!PCC_API_KEY) throw new Error("Missing PIPECAT_CLOUD_PUBLIC_API_KEY");
  const res = await fetch(`${PCC_API}/${PCC_AGENT_NAME}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PCC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`PCC start failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function stopPCCSession(sessionId: string): Promise<void> {
  if (PCC_PRIVATE_KEY) {
    await fetch(`https://api.pipecat.daily.co/v1/agents/${PCC_AGENT_NAME}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${PCC_PRIVATE_KEY}` },
    }).catch(() => {});
    return;
  }
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

async function cleanupSessions(): Promise<void> {
  const sessions = await prisma.session.findMany().catch(() => []);
  if (sessions.length === 0) return;
  const ids = sessions.flatMap((s: { agentSessions: string[] }) => s.agentSessions);
  const rooms = sessions.map((s: { roomName: string }) => s.roomName);

  // Delete rooms FIRST — force-disconnects all participants immediately
  await Promise.allSettled(
    rooms.map((name: string) => fetch(`https://api.daily.co/v1/rooms/${name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    }))
  );
  // Then stop PCC sessions (may already be dying from room deletion)
  await Promise.allSettled(ids.map(stopPCCSession));
  await prisma.session.deleteMany({ where: { id: { in: sessions.map((s: { id: string }) => s.id) } } }).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => null);
    const body = isRecord(raw) ? raw : {};

    if (shouldUseLocalAgentServer()) {
      const base = localAgentBaseUrl();
      const res = await fetch(`${base}/api/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Local agent error (${res.status}): ${await res.text()}`);
      return NextResponse.json(await res.json());
    }

    if (!PCC_API_KEY) {
      return NextResponse.json(
        {
          detail:
            "Missing PIPECAT_CLOUD_PUBLIC_API_KEY. Add it in Vercel → Settings → Environment Variables (Pipecat Cloud Dashboard → API Keys → Public).",
        },
        { status: 500 },
      );
    }

    await cleanupSessions();
    await new Promise((r) => setTimeout(r, 500));

    const [systemAgent, userAgent] = await resolveAgents(body);
    const allNames = [systemAgent.name, userAgent.name];
    const maxTurns = 20;

    const room = await dailyFetch("/rooms", {
      method: "POST",
      body: JSON.stringify({ properties: { exp: Math.floor(Date.now() / 1000) + 600 } }),
    });

    const getToken = (owner: boolean, userName?: string) =>
      dailyFetch("/meeting-tokens", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            room_name: room.name,
            ...(owner ? { is_owner: true } : {}),
            ...(userName ? { user_name: userName } : {}),
          },
        }),
      });

    let session1: { sessionId: string };
    let session2: { sessionId: string };
    try {
      const [t1, t2, tBrowser] = await Promise.all([
        getToken(true, systemAgent.name),
        getToken(false, userAgent.name),
        getToken(true, "Observer"),
      ]);

      const [r1, r2] = await Promise.allSettled([
        startPCCSession({
          room_url: room.url,
          token: t1.token,
          name: systemAgent.name,
          system_prompt: systemAgent.prompt || "",
          voice_id: systemAgent.voice_id || DEFAULT_VOICE_1,
          goes_first: true,
          known_agents: allNames,
          max_turns: maxTurns,
        }),
        startPCCSession({
          room_url: room.url,
          token: t2.token,
          name: userAgent.name,
          system_prompt: userAgent.prompt || "",
          voice_id: userAgent.voice_id || DEFAULT_VOICE_2,
          goes_first: false,
          known_agents: allNames,
          max_turns: maxTurns,
        }),
      ]);
      if (r1.status === "rejected" || r2.status === "rejected") {
        if (r1.status === "fulfilled") await stopPCCSession(r1.value.sessionId);
        if (r2.status === "fulfilled") await stopPCCSession(r2.value.sessionId);
        const failed = (r1.status === "rejected" ? r1 : r2) as PromiseRejectedResult;
        throw failed.reason;
      }
      session1 = r1.value;
      session2 = r2.value;

      await prisma.session.create({
        data: {
          roomName: room.name,
          roomUrl: room.url,
          agentSessions: [session1.sessionId, session2.sessionId],
        },
      }).catch(async (err: unknown) => {
        await Promise.all([
          stopPCCSession(session1.sessionId),
          stopPCCSession(session2.sessionId),
        ]);
        throw err;
      });

      return NextResponse.json({
        roomUrl: room.url,
        token: tBrowser.token,
        agentSessions: [session1.sessionId, session2.sessionId],
      });
    } catch (err) {
      await fetch(`https://api.daily.co/v1/rooms/${room.name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      }).catch(() => {});
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
