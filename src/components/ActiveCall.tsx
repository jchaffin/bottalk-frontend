"use client";

import { Loader2 } from "lucide-react";
import CallProvider from "./CallProvider";
import type { TurnMetric } from "./CallProvider";

interface ActiveCallProps {
  roomUrl: string | null;
  token: string | null;
  agentNames: [string, string];
  agentColors?: [string, string];
  scenarioLabel: string | null;
  starting?: boolean;
  onTranscript: (lines: { speaker: string; text: string }[]) => void;
  onMetrics?: (metrics: TurnMetric[]) => void;
  onLeave: () => void;
  onStop: () => void;
}

/** Wraps CallProvider with a loading state and stop button. */
export default function ActiveCall({
  roomUrl,
  token,
  agentNames,
  agentColors,
  scenarioLabel,
  starting,
  onTranscript,
  onMetrics,
  onLeave,
  onStop,
}: ActiveCallProps) {
  return (
    <div className="w-full max-w-2xl space-y-6">
      {starting && (
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-sm text-muted">Starting conversation...</span>
        </div>
      )}

      {!starting && roomUrl && token && (
        <div className="card p-6 shadow-xl shadow-shadow-color">
          <CallProvider
            roomUrl={roomUrl}
            token={token}
            agentNames={agentNames}
            agentColors={agentColors}
            title={scenarioLabel ?? undefined}
            onTranscript={onTranscript}
            onMetrics={onMetrics}
            onLeave={onLeave}
          />
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={onStop}
          disabled={starting}
          className="btn-danger"
        >
          Stop Conversation
        </button>
      </div>
    </div>
  );
}
