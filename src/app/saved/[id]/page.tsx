"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchConversation } from "@/lib/api";

const AGENT_COLOR_CLASSES = ["text-accent-agent1", "text-accent-agent2"];

export default function SavedConversationPage() {
  const params = useParams();
  const id = params.id as string;
  const [conversation, setConversation] = useState<Awaited<ReturnType<typeof fetchConversation>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchConversation(id)
      .then(setConversation)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen px-6 py-16">
        <p className="text-muted text-sm">Loading...</p>
      </main>
    );
  }

  if (error || !conversation) {
    return (
      <main className="flex flex-col items-center min-h-screen px-6 py-16">
        <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
          <p className="text-danger text-sm">{error ?? "Not found"}</p>
        </div>
        <Link href="/saved" className="mt-4 text-sm text-muted hover:text-foreground">
          ← Back to saved
        </Link>
      </main>
    );
  }

  const lines = conversation.lines as { speaker: string; text: string }[];
  const colorMap: Record<string, string> = {};
  conversation.agentNames.forEach((name, idx) => {
    colorMap[name] = AGENT_COLOR_CLASSES[idx] || AGENT_COLOR_CLASSES[0];
  });

  return (
    <main className="flex flex-col items-center min-h-screen px-6 py-16">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {conversation.title}
          </h1>
          <Link
            href="/saved"
            className="text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            ← Saved list
          </Link>
        </div>

        <p className="text-xs text-muted">
          {conversation.agentNames.join(" & ")} · {new Date(conversation.createdAt).toLocaleString()}
        </p>

        <div className="rounded-xl bg-surface-elevated border border-border p-5 text-sm leading-relaxed space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="py-1.5">
              <span className={`font-semibold ${colorMap[line.speaker] ?? "text-muted"}`}>
                {line.speaker}
              </span>
              <span className="text-muted mx-1.5">:</span>
              <span className="text-foreground/90">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
