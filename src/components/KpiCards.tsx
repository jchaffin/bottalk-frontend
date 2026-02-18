"use client";

import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

interface KpiGaugeProps {
  label: string;
  value: number | null;
  color: string;
}

function KpiGauge({ label, value, color }: KpiGaugeProps) {
  const displayValue = value !== null ? Math.round(value) : 0;
  const data = [{ value: displayValue, fill: color }];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-24 h-24 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "var(--surface-elevated)" }}
              dataKey="value"
              cornerRadius={6}
              animationDuration={800}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-foreground">
            {value !== null ? displayValue : "—"}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-muted text-center">
        {label}
      </span>
    </div>
  );
}

interface KpiCardsProps {
  kpiAverages: Record<string, number | null>;
  outcomeCounts: Record<string, number>;
}

const KPI_META: { key: string; label: string; color: string }[] = [
  { key: "resolution", label: "Resolution", color: "#686EFF" },
  { key: "sentiment", label: "Sentiment", color: "#22c55e" },
  { key: "efficiency", label: "Efficiency", color: "#f59e0b" },
  { key: "professionalism", label: "Professional", color: "#8b5cf6" },
  { key: "goalCompletion", label: "Goal Completion", color: "#ef4444" },
];

const OUTCOME_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#4ade80",
  average: "#f59e0b",
  needs_improvement: "#f97316",
  poor: "#ef4444",
  unclassified: "#6b7280",
};

const OUTCOME_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  average: "Average",
  needs_improvement: "Needs Improvement",
  poor: "Poor",
  unclassified: "Unclassified",
};

export default function KpiCards({ kpiAverages, outcomeCounts }: KpiCardsProps) {
  const hasKpis = Object.values(kpiAverages).some((v) => v !== null);
  const hasOutcomes = Object.keys(outcomeCounts).length > 0;
  const totalOutcomes = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* KPI Gauges */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          KPI Scores
          <span className="text-xs font-normal text-muted ml-2">
            (via Pinecone embeddings)
          </span>
        </h3>
        {hasKpis ? (
          <div className="flex flex-wrap justify-center gap-4">
            {KPI_META.map((kpi) => (
              <KpiGauge
                key={kpi.key}
                label={kpi.label}
                value={kpiAverages[kpi.key] ?? null}
                color={kpi.color}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted">
              No KPI data yet. Embed transcripts to see scores.
            </p>
          </div>
        )}
      </div>

      {/* Outcome Distribution */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Outcome Distribution
        </h3>
        {hasOutcomes ? (
          <div className="space-y-3">
            {Object.entries(outcomeCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([outcome, count]) => {
                const pct = totalOutcomes > 0 ? (count / totalOutcomes) * 100 : 0;
                return (
                  <div key={outcome} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground font-medium">
                        {OUTCOME_LABELS[outcome] || outcome}
                      </span>
                      <span className="text-muted">
                        {count} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: OUTCOME_COLORS[outcome] || "#6b7280",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted">
              No outcomes classified yet. Embed transcripts to see distribution.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
