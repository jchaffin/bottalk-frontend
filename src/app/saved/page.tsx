"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchConversations } from "@/lib/api";

export default function SavedPage() {
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof fetchConversations>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex flex-col items-center min-h-screen px-6 py-16">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Saved Conversations
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            ← Back
          </Link>
        </div>

        {loading && (
          <p className="text-muted text-sm">Loading...</p>
        )}

        {error && (
          <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <p className="text-muted text-sm">No saved conversations yet. Start a conversation and leave the room to save it.</p>
        )}

        {!loading && !error && conversations.length > 0 && (
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/saved/${c.id}`}
                  className="block rounded-xl bg-surface border border-border p-4 hover:border-accent/40 transition-colors"
                >
                  <p className="font-medium text-foreground">{c.title}</p>
                  <p className="text-xs text-muted mt-1">
                    {c.agentNames.join(" & ")} · {new Date(c.createdAt).toLocaleString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
