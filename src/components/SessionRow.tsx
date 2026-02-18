"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface SessionData {
  id: string;
  roomName: string;
  roomUrl: string;
  agentNames: string[];
  ttfb: number | null;
  llm: number | null;
  tts: number | null;
  e2e: number | null;
  turns: number;
  conversationId: string | null;
  createdAt: string;
}

function latencyColor(ms: number): string {
  if (ms < 500) return "text-emerald-400";
  if (ms < 1000) return "text-amber-400";
  return "text-red-400";
}

function LatencyCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <span className={`font-mono font-medium ${latencyColor(value)}`}>
      {value}ms
    </span>
  );
}

export default function SessionRow({ session: s }: { session: SessionData }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-surface-elevated/50 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-foreground font-medium truncate">
              {s.roomName}
            </span>
            <span className="text-[10px] text-muted">
              {s.agentNames.join(" & ")}
            </span>
          </div>
          <span className="text-[10px] text-muted/60">
            {new Date(s.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="flex items-center gap-5 text-xs shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-muted">TTFB</span>
            <LatencyCell value={s.ttfb} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-muted">LLM</span>
            <LatencyCell value={s.llm} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-muted">TTS</span>
            <LatencyCell value={s.tts} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-muted">E2E</span>
            <LatencyCell value={s.e2e} />
          </div>
          <span className="text-[10px] text-muted w-16 text-right">
            {s.turns} turn{s.turns !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-border/50 space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <a
              href={s.roomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
            >
              Daily Room <ExternalLink className="w-3 h-3" />
            </a>
            {s.conversationId && (
              <Link
                href={`/transcripts/${s.conversationId}`}
                className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
              >
                View Transcript <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {(s.ttfb != null || s.llm != null || s.tts != null || s.e2e != null) && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Avg TTFB", value: s.ttfb, color: "#686EFF" },
                { label: "Avg LLM", value: s.llm, color: "#22c55e" },
                { label: "Avg TTS", value: s.tts, color: "#f59e0b" },
                { label: "Avg E2E", value: s.e2e, color: "#ef4444" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-lg border border-border p-3 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                    {metric.label}
                  </p>
                  <p
                    className="text-lg font-bold font-mono"
                    style={{ color: metric.value != null ? metric.color : undefined }}
                  >
                    {metric.value != null ? `${metric.value}ms` : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted/50 font-mono">
            Session ID: {s.id}
          </p>
        </div>
      )}
    </div>
  );
}
