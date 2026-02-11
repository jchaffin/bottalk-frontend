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

/** Create a Daily room and spawn both agents via Pipecat Cloud. */
export async function startConversation(): Promise<StartResponse> {
  const res = await fetch("/api/start", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/** Terminate running agent sessions. */
export async function stopConversation(): Promise<void> {
  await fetch("/api/stop", { method: "POST" });
}
