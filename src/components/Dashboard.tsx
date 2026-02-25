"use client";

import { useState, useEffect, useCallback } from "react";
import SummaryCards from "@/components/SummaryCards";
import MetricsCards from "@/components/MetricsCards";
import LatencyChart from "@/components/LatencyChart";
import KpiCards from "@/components/KpiCards";
import SessionsTable from "@/components/SessionsTable";

interface DashboardData {
  period: { days: number; since: string };
  summary: {
    totalSessions: number;
    totalConversations: number;
    totalMetricPoints: number;
    classifiedCount: number;
  };
  latency: {
    ttfb: number | null;
    llm: number | null;
    tts: number | null;
    e2e: number | null;
  };
  kpiAverages: Record<string, number | null>;
  outcomeCounts: Record<string, number>;
  latencyTimeseries: {
    time: string;
    ttfb: number | null;
    llm: number | null;
    tts: number | null;
    e2e: number | null;
  }[];
  recentConversations: {
    id: string;
    title: string;
    agentNames: string[];
    outcome: string | null;
    kpiScores: Record<string, number> | null;
    lineCount: number;
    createdAt: string;
  }[];
}

const TIME_RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [embedding, setEmbedding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard?days=${days}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  async function handleDelete(conversationId: string) {
    if (!confirm("Delete this transcript? This cannot be undone.")) return;
    setDeleting(conversationId);
    try {
      const res = await fetch(`/api/transcripts/${conversationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchDashboard();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleEmbed(conversationId: string) {
    setEmbedding(conversationId);
    try {
      const res = await fetch("/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `API error ${res.status}`);
      }
      await fetchDashboard();
    } catch (err) {
      console.error("Embed error:", err);
    } finally {
      setEmbedding(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-6 max-w-md text-center">
          <p className="text-danger text-sm mb-3">{error}</p>
          <button onClick={fetchDashboard} className="btn-secondary text-xs">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Performance Overview
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Pipecat Cloud agent metrics and KPI outcomes
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                days === range.days
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards {...data.summary} />

      {/* Latency metrics */}
      <MetricsCards {...data.latency} />

      {/* Latency chart */}
      <LatencyChart data={data.latencyTimeseries} />

      {/* KPI scores + outcome distribution */}
      <KpiCards
        kpiAverages={data.kpiAverages}
        outcomeCounts={data.outcomeCounts}
      />

      {/* Sessions table */}
      <SessionsTable
        conversations={data.recentConversations}
        onEmbed={handleEmbed}
        onDelete={handleDelete}
        embedding={embedding}
        deleting={deleting}
      />
    </div>
  );
}
