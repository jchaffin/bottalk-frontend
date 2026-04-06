/**
 * Whether API routes should proxy to a local Python agent (dev.py) instead of Pipecat Cloud.
 *
 * On Vercel, missing PCC keys must NOT fall back to localhost — that always fails.
 * Local dev without PCC keys still uses localhost when not on Vercel.
 */
export function shouldUseLocalAgentServer(): boolean {
  const pccKey =
    process.env.PIPECAT_CLOUD_PUBLIC_API_KEY || process.env.PIPECAT_CLOUD_API_KEY;
  const publicUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  const agentName =
    process.env.NEXT_PUBLIC_PCC_AGENT_NAME ||
    process.env.PCC_AGENT_NAME ||
    "bottalk-agent";

  if (publicUrl) return true;
  if (agentName === "local") return true;
  if (!pccKey && process.env.VERCEL !== "1") return true;
  return false;
}

export function localAgentBaseUrl(): string {
  const u = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  return u.replace(/\/$/, "") || "http://localhost:8000";
}
