import { NextRequest, NextResponse } from "next/server";
import { PCC_AGENT_NAME } from "@/lib/config";

const PCC_API = "https://api.pipecat.daily.co/v1/public";
const PCC_API_KEY = process.env.PIPECAT_CLOUD_API_KEY!;

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

  const errors: string[] = [];
  const results = await Promise.allSettled(
    sessionIds.map(async (sid) => {
      const url = `${PCC_API}/${PCC_AGENT_NAME}/sessions/${sid}/metrics`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${PCC_API_KEY}` },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const msg = `PCC ${res.status} for ${sid}: ${body.slice(0, 200)}`;
        console.error("[pcc-metrics]", msg);
        errors.push(msg);
        return null;
      }
      return res.json();
    }),
  );

  const metrics = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value != null)
    .map((r) => r.value);

  return NextResponse.json({ sessions: metrics, errors: errors.length > 0 ? errors : undefined });
}
