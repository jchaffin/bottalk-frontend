"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { fetchConversation, deleteConversation } from "@/lib/api";
import {
  KPI_DEFINITIONS,
  OUTCOME_LABELS,
  OUTCOME_COLORS,
  type KpiScores,
  type OutcomeLabel,
  type TurnAnnotation,
  type TurnSentiment,
} from "@/lib/kpis";

const AGENT_COLOR_CLASSES = ["text-accent-agent1", "text-accent-agent2"];

const SENTIMENT_DOT: Record<TurnSentiment, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-amber-400",
  negative: "bg-red-400",
};

const KPI_LABELS: Record<string, string> = Object.fromEntries(
  KPI_DEFINITIONS.map((k) => [k.key, k.label]),
);

type ConversationView = {
  id: string;
  title: string;
  agentNames: string[];
  createdAt: string;
  roomUrl?: string | null;
  outcome?: OutcomeLabel | null;
  lines: { speaker: string; text: string }[];
  latencyMetrics?: LatencyMetric[] | null;
  kpiScores?: (KpiScores & { turnAnnotations?: TurnAnnotation[] }) | null;
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 80 ? "bg-emerald-400" : pct >= 60 ? "bg-green-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 text-muted shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-foreground/80 text-xs">{Math.round(value)}</span>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: OutcomeLabel }) {
  const label = OUTCOME_LABELS[outcome] ?? outcome;
  const color = OUTCOME_COLORS[outcome] ?? "text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-surface-elevated ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color.replace("text-", "bg-")}`} />
      {label}
    </span>
  );
}

const ROLE_BADGE: Record<string, { text: string; className: string }> = {
  agent: { text: "Agent", className: "text-accent-agent1 bg-accent-agent1/10 border-accent-agent1/20" },
  user: { text: "User", className: "text-accent-agent2 bg-accent-agent2/10 border-accent-agent2/20" },
};

function TurnAnnotationBadge({ annotation }: { annotation: TurnAnnotation }) {
  const roleBadge = annotation.role ? ROLE_BADGE[annotation.role] : null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_DOT[annotation.sentiment]}`} />
      {roleBadge && (
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${roleBadge.className}`}>
          {roleBadge.text}
        </span>
      )}
      <span className="text-xs text-muted/80 italic">{annotation.label}</span>
      {annotation.relevantKpis.length > 0 && (
        <span className="text-[10px] text-muted/50 font-mono">
          {annotation.relevantKpis.map((k) => KPI_LABELS[k] ?? k).join(", ")}
        </span>
      )}
    </div>
  );
}

interface LatencyMetric {
  agent: string;
  turn?: number;
  ttfb?: number;
  llm?: number;
  tts?: number;
  e2e?: number;
}

function latencyColor(ms: number): string {
  if (ms < 500) return "text-emerald-400";
  if (ms < 1000) return "text-amber-400";
  return "text-red-400";
}

function LatencyValue({ label, ms }: { label: string; ms: number | undefined }) {
  if (ms == null) return null;
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-sm font-mono font-medium ${latencyColor(ms)}`}>{ms}ms</span>
    </div>
  );
}

function AgentLatencySummary({ agent, metrics }: { agent: string; metrics: LatencyMetric[] }) {
  const agentMetrics = metrics.filter((m) => m.agent === agent);
  if (agentMetrics.length === 0) return null;

  const avg = (key: keyof LatencyMetric) => {
    const vals = agentMetrics
      .map((m) => m[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
  };

  return (
    <div className="flex items-center gap-6">
      <span className="text-sm font-semibold text-foreground w-20 shrink-0">{agent}</span>
      <div className="flex gap-6">
        <LatencyValue label="TTFB" ms={avg("ttfb")} />
        <LatencyValue label="LLM" ms={avg("llm")} />
        <LatencyValue label="TTS" ms={avg("tts")} />
        <LatencyValue label="E2E" ms={avg("e2e")} />
      </div>
      <span className="text-[10px] text-muted ml-auto">{agentMetrics.length} turns</span>
    </div>
  );
}

export default function TranscriptPage() {
  const params = useParams();
  const id = params.id as string;
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
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
        <Link href="/transcripts" className="mt-4 text-sm text-muted hover:text-foreground">
          ← Back to transcripts
        </Link>
      </main>
    );
  }

  const lines = conversation.lines;
  const colorMap: Record<string, string> = {};
  conversation.agentNames.forEach((name, idx) => {
    colorMap[name] = AGENT_COLOR_CLASSES[idx] || AGENT_COLOR_CLASSES[0];
  });

  const kpiData = conversation.kpiScores ?? null;
  const scores = kpiData ? {
    discovery: kpiData.discovery,
    objectionHandling: kpiData.objectionHandling,
    valueArticulation: kpiData.valueArticulation,
    turnTaking: kpiData.turnTaking,
    responseRelevance: kpiData.responseRelevance,
    nextSteps: kpiData.nextSteps,
  } : null;
  const turnAnnotations: TurnAnnotation[] = kpiData?.turnAnnotations ?? [];
  const outcome = conversation.outcome as OutcomeLabel | null;
  const roomUrl = conversation.roomUrl as string | null;
  const latencyMetrics = (conversation.latencyMetrics ?? []) as LatencyMetric[];
  const uniqueAgents = [...new Set(latencyMetrics.map((m) => m.agent))];

  return (
    <main className="flex flex-col items-center min-h-screen px-6 py-16">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {conversation.title}
              </h1>
              {outcome && <OutcomeBadge outcome={outcome} />}
            </div>
            <p className="text-xs text-muted">
              {conversation.agentNames.join(" & ")} · {new Date(conversation.createdAt).toLocaleString()}
              {roomUrl && (
                <>
                  {" · "}
                  <a
                    href={roomUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-accent hover:text-accent-hover"
                  >
                    Daily Room <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (!confirm("Delete this transcript? This cannot be undone.")) return;
                setDeleting(true);
                try {
                  await deleteConversation(conversation.id);
                  router.push("/transcripts");
                } catch {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="p-2 rounded-lg text-muted hover:text-danger hover:bg-error-bg transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <Link
              href="/transcripts"
              className="text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              ← Transcripts
            </Link>
          </div>
        </div>

        {/* KPI Score Bars */}
        {scores && (
          <div className="rounded-xl bg-surface-elevated border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground mb-2">KPI Scores</h2>
            {KPI_DEFINITIONS.map((kpi) => (
              <ScoreBar
                key={kpi.key}
                label={kpi.label}
                value={scores[kpi.key as keyof typeof scores] ?? 0}
              />
            ))}
          </div>
        )}

        {/* Latency Metrics */}
        {latencyMetrics.length > 0 && (
          <div className="rounded-xl bg-surface-elevated border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Latency Metrics</h2>
            <div className="space-y-3">
              {uniqueAgents.map((agent) => (
                <AgentLatencySummary key={agent} agent={agent} metrics={latencyMetrics} />
              ))}
            </div>
            <details className="group">
              <summary className="text-[11px] text-muted cursor-pointer hover:text-foreground transition-colors">
                Per-turn breakdown
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">Agent</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">Turn</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">TTFB</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">LLM</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">TTS</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-muted uppercase">E2E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latencyMetrics.map((m, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-2 py-1.5 font-medium text-foreground">{m.agent}</td>
                        <td className="px-2 py-1.5 font-mono text-muted">{m.turn ?? i + 1}</td>
                        <td className={`px-2 py-1.5 font-mono ${m.ttfb != null ? latencyColor(m.ttfb) : "text-muted"}`}>
                          {m.ttfb != null ? `${m.ttfb}ms` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 font-mono ${m.llm != null ? latencyColor(m.llm) : "text-muted"}`}>
                          {m.llm != null ? `${m.llm}ms` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 font-mono ${m.tts != null ? latencyColor(m.tts) : "text-muted"}`}>
                          {m.tts != null ? `${m.tts}ms` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 font-mono ${m.e2e != null ? latencyColor(m.e2e) : "text-muted"}`}>
                          {m.e2e != null ? `${m.e2e}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}

        {/* Annotated Transcript */}
        <div className="rounded-xl bg-surface-elevated border border-border p-5 text-sm leading-relaxed space-y-1">
          <h2 className="text-sm font-semibold text-foreground mb-3">Transcript</h2>
          {lines.map((line: { speaker: string; text: string }, idx: number) => {
            const annotation = turnAnnotations[idx];
            // Derive role from speaker — agentNames[0] = agent being evaluated, [1] = user
            const role = line.speaker === conversation.agentNames[0] ? "agent" : "user";
            const correctedAnn = annotation
              ? { ...annotation, role }
              : undefined;
            return (
              <div key={idx} className="py-2 border-b border-border/30 last:border-0">
                <div>
                  <span className={`font-semibold ${colorMap[line.speaker] ?? "text-muted"}`}>
                    {line.speaker}
                  </span>
                  <span className="text-muted mx-1.5">:</span>
                  <span className="text-foreground/90">{line.text}</span>
                </div>
                {correctedAnn && correctedAnn.label && (
                  <TurnAnnotationBadge annotation={correctedAnn} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
