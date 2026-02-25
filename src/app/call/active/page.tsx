"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActiveCall from "@/components/ActiveCall";
import { stopConversation } from "@/lib/api";
import { getCallSession, clearCallSession } from "@/lib/call-session";

export default function CallActivePage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof getCallSession>>(null);

  useEffect(() => {
    const s = getCallSession();
    setSession(s);
    if (!s) {
      router.replace("/call");
    }
  }, [router]);

  function handleLeave() {
    clearCallSession();
    router.replace("/call");
  }

  async function handleStop() {
    try {
      await stopConversation();
    } catch {
      /* best-effort */
    }
    clearCallSession();
    router.replace("/call");
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-muted">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex flex-col items-center justify-center min-h-[50vh] px-0 sm:px-6 py-6 sm:py-16">
      <ActiveCall
        roomUrl={session.roomUrl}
        token={session.token}
        agentSessions={session.agentSessions}
        agentNames={session.agentNames}
        agentColors={session.agentColors}
        scenarioLabel={session.scenarioLabel}
        starting={false}
        onTranscript={() => {}}
        onLeave={handleLeave}
        onStop={handleStop}
        onCallEnded={async () => {
          await stopConversation();
          handleLeave();
        }}
      />
    </div>
  );
}
