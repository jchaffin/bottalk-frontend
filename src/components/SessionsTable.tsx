"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface ConversationRow {
  id: string;
  title: string;
  agentNames: string[];
  outcome: string | null;
  kpiScores: Record<string, number> | null;
  lineCount: number;
  createdAt: string;
}

interface SessionsTableProps {
  conversations: ConversationRow[];
  onEmbed?: (conversationId: string) => void;
  embedding?: string | null;
}

const OUTCOME_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  excellent: { bg: "rgba(34,197,94,0.12)", text: "#22c55e", label: "Excellent" },
  good: { bg: "rgba(74,222,128,0.12)", text: "#4ade80", label: "Good" },
  average: { bg: "rgba(245,158,11,0.12)", text: "#f59e0b", label: "Average" },
  needs_improvement: {
    bg: "rgba(249,115,22,0.12)",
    text: "#f97316",
    label: "Needs Improvement",
  },
  poor: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Poor" },
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-elevated text-muted">
        Unclassified
      </span>
    );
  }
  const badge = OUTCOME_BADGE[outcome];
  if (!badge) return <span className="text-xs text-muted">{outcome}</span>;

  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{ background: badge.bg, color: badge.text }}
    >
      {badge.label}
    </span>
  );
}

function KpiMini({ scores }: { scores: Record<string, number> | null }) {
  const vals = scores
    ? Object.values(scores).filter((v) => Number.isFinite(v))
    : [];
  if (vals.length === 0) return <span className="text-xs text-muted">—</span>;
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return (
    <span className="text-xs font-mono text-foreground">{avg}</span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsTable({
  conversations,
  onEmbed,
  embedding,
}: SessionsTableProps) {
  if (!conversations.length) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <p className="text-sm text-muted">
          No conversations yet. Start a session to see data here.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Recent Conversations
        </h3>
        <Link
          href="/transcripts"
          className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
        >
          View all <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Title
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Agents
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Outcome
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                KPI Avg
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Lines
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Date
              </th>
              <th className="px-5 py-2.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/transcripts/${c.id}`}
                    className="text-foreground font-medium hover:text-accent transition-colors"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {c.agentNames.join(" & ")}
                </td>
                <td className="px-5 py-3">
                  <OutcomeBadge outcome={c.outcome} />
                </td>
                <td className="px-5 py-3">
                  <KpiMini scores={c.kpiScores} />
                </td>
                <td className="px-5 py-3 text-xs text-muted font-mono">
                  {c.lineCount}
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {formatDate(c.createdAt)}
                </td>
                <td className="px-5 py-3">
                  {!c.outcome && onEmbed && (
                    <button
                      onClick={() => onEmbed(c.id)}
                      disabled={embedding === c.id}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                    >
                      {embedding === c.id ? "Embedding..." : "Embed & Classify"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
