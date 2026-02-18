"use client";

import { Activity, Zap, AudioLines, Timer } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number | null;
  unit: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "flat";
  color: string;
}

function MetricCard({ label, value, unit, icon, color }: MetricCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          {value !== null ? Math.round(value) : "—"}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </div>
  );
}

interface MetricsCardsProps {
  ttfb: number | null;
  llm: number | null;
  tts: number | null;
  e2e: number | null;
}

export default function MetricsCards({ ttfb, llm, tts, e2e }: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="TTFB"
        value={ttfb}
        unit="ms"
        icon={<Zap className="w-4 h-4" />}
        color="#686EFF"
      />
      <MetricCard
        label="LLM Latency"
        value={llm}
        unit="ms"
        icon={<Activity className="w-4 h-4" />}
        color="#22c55e"
      />
      <MetricCard
        label="TTS Latency"
        value={tts}
        unit="ms"
        icon={<AudioLines className="w-4 h-4" />}
        color="#f59e0b"
      />
      <MetricCard
        label="E2E Latency"
        value={e2e}
        unit="ms"
        icon={<Timer className="w-4 h-4" />}
        color="#ef4444"
      />
    </div>
  );
}
