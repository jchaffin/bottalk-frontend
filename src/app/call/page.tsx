"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  startQuickCall,
  stopConversation,
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
} from "@/lib/api";
import { DEFAULT_AGENT_COLORS } from "@/lib/config";
import ActiveCall from "@/components/ActiveCall";
import type { TurnMetric } from "@/components/CallProvider";

type Phase = "starting" | "active" | "error";

const AGENT_NAMES: [string, string] = ["Sarah", "Mike"];
const SCENARIO_LABEL = "Quick Start — Sarah & Mike";

export default function CallPage() {
  const [phase, setPhase] = useState<Phase>("starting");
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agentSessions, setAgentSessions] = useState<string[] | undefined>();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const collectedMetricsRef = useRef<TurnMetric[]>([]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    stopConversation().catch(() => {});

    startQuickCall()
      .then(({ roomUrl, token, agentSessions }) => {
        setRoomUrl(roomUrl);
        setToken(token);
        setAgentSessions(agentSessions);
        setPhase("active");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start call");
        setPhase("error");
      });

    const cleanup = () => { stopConversation().catch(() => {}); };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  async function handleStop() {
    try { await stopConversation(); } catch { /* best-effort */ }
    window.location.href = "/";
  }

  function handleLeave() {
    window.location.href = "/";
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
          <p className="text-danger text-sm">{error}</p>
        </div>
        <button onClick={() => window.location.href = "/"} className="btn-secondary text-xs">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{SCENARIO_LABEL}</h1>
        <p className="text-sm text-muted">Default sales conversation</p>
      </div>

      <ActiveCall
        roomUrl={roomUrl}
        token={token}
        agentSessions={agentSessions}
        agentNames={AGENT_NAMES}
        agentColors={DEFAULT_AGENT_COLORS}
        scenarioLabel={SCENARIO_LABEL}
        starting={phase === "starting"}
        onTranscript={() => {}}
        onMetrics={(metrics) => {
          collectedMetricsRef.current = metrics;
        }}
        onLeave={handleLeave}
        onStop={handleStop}
      />
    </div>
  );
}
