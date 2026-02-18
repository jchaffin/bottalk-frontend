import { NextRequest, NextResponse } from "next/server";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY =
  process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Proxy PCC Session API metrics for one or more agent sessions.
 *
 *   GET /api/pcc-metrics?sessions=id1,id2
 *
 * Fetches /metrics/summary from each session and merges the results.
 */
export async function GET(request: NextRequest) {
  const csv = request.nextUrl.searchParams.get("sessions") ?? "";
  const sessionIds = csv.split(",").filter(Boolean);

  if (sessionIds.length === 0) {
    return NextResponse.json({ error: "sessions param required" }, { status: 400 });
  }

  if (!PCC_API_KEY) {
    return NextResponse.json(
      { error: "Missing PIPECAT_CLOUD_PUBLIC_API_KEY (or PIPECAT_CLOUD_API_KEY)" },
      { status: 500 },
    );
  }

  const errors: string[] = [];

  async function fetchSessionMetrics(sid: string) {
    const url = `${PCC_API}/${PCC_AGENT_NAME}/sessions/${sid}/metrics`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${PCC_API_KEY}` },
        cache: "no-store",
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(6_000),
      });

      if (res.ok) {
        const raw = await res.json();
        return isRecord(raw) ? raw : { raw };
      }

      // PCC sessions can briefly 500 while the bot is still initializing.
      // One short retry smooths over that transient.
      const body = await res.text().catch(() => "");
      const msg = `PCC ${res.status} for ${sid}: ${body.slice(0, 200)}`;
      if (attempt === 0 && res.status >= 500) {
        await new Promise((r) => setTimeout(r, 650));
        continue;
      }
      console.error("[pcc-metrics]", msg);
      errors.push(msg);
      return null;
    }
    return null;
  }

  const results = await Promise.allSettled(
    sessionIds.map(async (sid) => {
      return fetchSessionMetrics(sid);
    }),
  );

  const metrics = results
    .filter(
      (r): r is PromiseFulfilledResult<Record<string, unknown>> =>
        r.status === "fulfilled" && r.value != null,
    )
    .map((r) => r.value);

  return NextResponse.json({ sessions: metrics, errors: errors.length > 0 ? errors : undefined });
}
