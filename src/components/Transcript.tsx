"use client";

import { memo, useEffect, useRef } from "react";
import { type TranscriptLine } from "@/lib/api";
import { Activity, Zap } from "lucide-react";

const AGENT_COLOR_CLASSES = ["text-accent-agent1", "text-accent-agent2"];

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-amber-400",
  negative: "bg-red-400",
};

function latencyColor(ms: number): string {
  if (ms < 500) return "text-emerald-400";
  if (ms < 1000) return "text-amber-400";
  return "text-red-400";
}

function MetricTag({ label, ms }: { label: string; ms: number }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${latencyColor(ms)}`}>
      <span className="text-muted/50 uppercase">{label}</span>
      {ms}ms
    </span>
  );
}

function LatencyBadge({ metrics }: { metrics: NonNullable<TranscriptLine["metrics"]> }) {
  const hasAny = metrics.llm != null || metrics.tts != null || metrics.e2e != null;
  if (!hasAny) return null;

  return (
    <span className="inline-flex items-center gap-2 ml-2 px-2 py-0.5 rounded-md bg-white/[0.03] border border-border/50">
      <Activity className="w-3 h-3 text-muted/40 flex-shrink-0" />
      {metrics.llm != null && <MetricTag label="LLM" ms={metrics.llm} />}
      {metrics.tts != null && <MetricTag label="TTS" ms={metrics.tts} />}
      {metrics.e2e != null && <MetricTag label="E2E" ms={metrics.e2e} />}
    </span>
  );
}

const ROLE_STYLE: Record<string, string> = {
  agent: "text-accent-agent1 bg-accent-agent1/10 border-accent-agent1/20",
  user: "text-accent-agent2 bg-accent-agent2/10 border-accent-agent2/20",
};

function AnnotationTag({ annotation }: { annotation: NonNullable<TranscriptLine["annotation"]> }) {
  if (!annotation.label) return null;
  const dot = SENTIMENT_DOT[annotation.sentiment] || SENTIMENT_DOT.neutral;
  const roleStyle = annotation.role ? ROLE_STYLE[annotation.role] : null;
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {roleStyle && (
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border ${roleStyle}`}>
          {annotation.role}
        </span>
      )}
      <span className="text-[11px] text-muted/80 italic">{annotation.label}</span>
      {annotation.relevantKpis.length > 0 && (
        <span className="text-[10px] text-muted/40 font-mono">
          {annotation.relevantKpis.join(", ")}
        </span>
      )}
    </div>
  );
}

const Line = memo(function Line({
  line,
  colorMap,
  systemAgentName,
}: {
  line: TranscriptLine;
  colorMap: Record<string, string>;
  systemAgentName: string;
}) {
  const colorClass = colorMap[line.speaker] || "text-muted";
  const isSystemAgent = line.speaker === systemAgentName;
  return (
    <div className={`py-2 border-b border-border/20 last:border-0 ${line.interim ? "opacity-40" : ""}`}>
      <div>
        <span className={`font-semibold ${colorClass}`}>
          {line.speaker}
        </span>
        {line.interrupted && (
          <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] font-semibold text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded px-1 py-0.5">
            <Zap className="w-2.5 h-2.5" />
            interrupted
          </span>
        )}
        <span className="text-muted mx-1.5">:</span>
        <span className="text-foreground/90">{line.text}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {line.metrics && isSystemAgent && <LatencyBadge metrics={line.metrics} />}
        {line.annotation && <AnnotationTag annotation={line.annotation} />}
      </div>
    </div>
  );
});

/** [systemAgentName, userAgentName] — System = goes_first, User = counterpart. */
interface TranscriptProps {
  lines: TranscriptLine[];
  agentNames: [string, string];
}

const Transcript = memo(function Transcript({ lines, agentNames }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const systemAgentName = agentNames[0];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const colorMap: Record<string, string> = {};
  agentNames.forEach((name, idx) => {
    colorMap[name] = AGENT_COLOR_CLASSES[idx] || AGENT_COLOR_CLASSES[0];
  });

  return (
    <div
      ref={scrollRef}
      className="w-full h-80 overflow-y-auto rounded-xl bg-surface-elevated border border-border p-5 text-sm leading-relaxed scrollbar-thin"
    >
      {lines.length === 0 && (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted italic">Waiting for agents to speak...</p>
        </div>
      )}
      {lines.map((line) => (
        <Line key={line.id} line={line} colorMap={colorMap} systemAgentName={systemAgentName} />
      ))}
    </div>
  );
});

export default Transcript;
