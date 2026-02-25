/** Session storage key for active call params (used when navigating to /call/active). */
const STORAGE_KEY = "bottalk-active-call";

export interface StoredCallSession {
  roomUrl: string;
  token: string;
  agentSessions?: string[];
  agentNames: [string, string];
  agentColors: [string, string];
  scenarioLabel: string | null;
}

export function storeCallSession(session: StoredCallSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function getCallSession(): StoredCallSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCallSession;
    if (!parsed.roomUrl || !parsed.token || !Array.isArray(parsed.agentNames)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCallSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
