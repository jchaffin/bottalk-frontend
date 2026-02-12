export interface StartResponse {
  roomUrl: string;
  token: string;
}

export interface TranscriptLine {
  id: number;
  speaker: string;
  text: string;
  /** true while Deepgram is still processing this utterance */
  interim?: boolean;
}

// Local dev: set NEXT_PUBLIC_API_URL=http://localhost:8000 to hit dev.py
// Production (Vercel): leave unset, calls same-origin API routes
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/** Create a Daily room and spawn both agents. */
export async function startConversation(): Promise<StartResponse> {
  const res = await fetch(`${API_BASE}/api/start`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Terminate running agent sessions. */
export async function stopConversation(): Promise<void> {
  await fetch(`${API_BASE}/api/stop`, { method: "POST" });
}
