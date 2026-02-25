"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { fetchConversations, deleteConversation } from "@/lib/api";

const PAGE_SIZE = 20;

export default function TranscriptsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConversations>> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchConversations({ page, limit: PAGE_SIZE })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this transcript? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deleteConversation(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  const conversations = data?.conversations ?? [];
  const totalPages = data?.totalPages ?? 0;
  const total = data?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main className="flex flex-col items-center min-h-screen px-6 py-16">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Transcripts
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
          <p className="text-muted text-sm">No transcripts yet. Start a conversation and leave the room to save it.</p>
        )}

        {!loading && !error && conversations.length > 0 && (
          <>
            <ul className="space-y-2">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div className="flex items-center gap-2 rounded-xl bg-surface border border-border p-4 hover:border-accent/40 transition-colors group">
                    <Link
                      href={`/transcripts/${c.id}`}
                      className="flex-1 min-w-0"
                    >
                      <p className="font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted mt-1">
                        {c.agentNames.join(" & ")} · {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </Link>
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      disabled={deleting === c.id}
                      className="p-2 rounded-lg text-muted hover:text-danger hover:bg-error-bg transition-colors disabled:opacity-50"
                      aria-label="Delete transcript"
                    >
                      {deleting === c.id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <p className="text-xs text-muted">
                  {total} total · Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!hasPrev}
                    className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={!hasNext}
                    className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
