"use client";

import { memo, useEffect, useRef } from "react";
import { type TranscriptLine } from "../lib/api";

// Memoized per-line component. Because linesSnapshot preserves object references
// for completed lines, React.memo skips re-rendering every finished line and only
// touches the 1-2 active lines whose object reference changed.
const Line = memo(function Line({ line }: { line: TranscriptLine }) {
  const colorClass =
    line.speaker === "Sarah"
      ? "text-blue-400"
      : line.speaker === "Mike"
        ? "text-purple-400"
        : "text-gray-400";
  return (
    <div className={`mb-1${line.interim ? " opacity-50" : ""}`}>
      <span className={`font-semibold ${colorClass}`}>
        {line.speaker}:
      </span>{" "}
      {line.text}
    </div>
  );
});

interface TranscriptProps {
  lines: TranscriptLine[];
}

// Memoize the entire Transcript so parent re-renders (e.g. speaking-state
// changes from participant-updated) don't cascade into it at all.
const Transcript = memo(function Transcript({ lines }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div ref={scrollRef} className="w-full max-w-2xl h-80 overflow-y-auto rounded-lg bg-[#1a1a1a] p-4 text-sm leading-relaxed">
      {lines.length === 0 && (
        <p className="text-gray-500 italic">Waiting for agents to speak...</p>
      )}
      {lines.map((line) => (
        <Line key={line.id} line={line} />
      ))}
    </div>
  );
});

export default Transcript;
