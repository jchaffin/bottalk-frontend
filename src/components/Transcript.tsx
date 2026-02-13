"use client";

import { memo, useEffect, useRef } from "react";
import { type TranscriptLine } from "../lib/api";

const AGENT_COLOR_CLASSES = ["text-accent-agent1", "text-accent-agent2"];

const Line = memo(function Line({
  line,
  colorMap,
}: {
  line: TranscriptLine;
  colorMap: Record<string, string>;
}) {
  const colorClass = colorMap[line.speaker] || "text-muted";
  return (
    <div className={`py-1.5 ${line.interim ? "opacity-40" : ""}`}>
      <span className={`font-semibold ${colorClass}`}>
        {line.speaker}
      </span>
      <span className="text-muted mx-1.5">:</span>
      <span className="text-foreground/90">{line.text}</span>
    </div>
  );
});

interface TranscriptProps {
  lines: TranscriptLine[];
  agentNames: [string, string];
}

const Transcript = memo(function Transcript({ lines, agentNames }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Build a name → color class mapping
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
        <Line key={line.id} line={line} colorMap={colorMap} />
      ))}
    </div>
  );
});

export default Transcript;
