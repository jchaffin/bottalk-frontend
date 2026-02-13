"use client";

import { useState } from "react";
import {
  generatePrompts,
  startConversation,
  stopConversation,
  type GeneratedPrompts,
} from "../lib/api";
import CallProvider from "../components/CallProvider";

type Phase = "idle" | "generating" | "preview" | "starting" | "active";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [topic, setTopic] = useState("Enterprise software sales call — Sarah is pitching an AI workflow automation platform to Mike, a skeptical VP of Operations at an e-commerce company");
  const [prompts, setPrompts] = useState<GeneratedPrompts | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (topic.trim().length < 5) {
      setError("Topic must be at least 5 characters.");
      return;
    }
    setError(null);
    setPhase("generating");
    try {
      const result = await generatePrompts(topic.trim());
      setPrompts(result);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prompts");
      setPhase("idle");
    }
  }

  async function handleStart() {
    if (!prompts) return;
    setError(null);
    setPhase("starting");
    try {
      const { roomUrl, token } = await startConversation({
        sarah_prompt: prompts.sarah.prompt,
        mike_prompt: prompts.mike.prompt,
      });
      setRoomUrl(roomUrl);
      setToken(token);
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setPhase("preview");
    }
  }

  async function handleStop() {
    try {
      await stopConversation();
    } catch {
      // best-effort
    } finally {
      setRoomUrl(null);
      setToken(null);
      setPhase("idle");
      setPrompts(null);
      setTopic("");
    }
  }

  function handleBack() {
    setPrompts(null);
    setPhase("idle");
  }

  function updatePrompt(agent: "sarah" | "mike", field: "role" | "prompt", value: string) {
    if (!prompts) return;
    setPrompts({
      ...prompts,
      [agent]: { ...prompts[agent], [field]: value },
    });
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16 gap-10">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-border text-xs font-medium text-muted mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live Demo
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Sales Conversation
        </h1>
        <p className="text-base text-muted max-w-md mx-auto">
          Describe a topic and watch two AI voice agents have a real-time call.
        </p>
      </div>

      {/* === IDLE: Topic input === */}
      {(phase === "idle" || phase === "generating") && (
        <div className="w-full max-w-xl space-y-4">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, 500))}
            placeholder="Describe the conversation topic... e.g. 'A sales call about CRM software for a small real estate agency'"
            rows={3}
            disabled={phase === "generating"}
            className="w-full rounded-xl bg-surface border border-border p-4 text-sm text-foreground placeholder:text-muted/60 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 transition-all"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted/50 font-mono">
              {topic.length}/500
            </span>
            <button
              onClick={handleGenerate}
              disabled={phase === "generating" || topic.trim().length < 5}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-gradient-start to-gradient-end hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-accent/20 flex items-center gap-2"
            >
              {phase === "generating" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                "Generate Roles"
              )}
            </button>
          </div>
        </div>
      )}

      {/* === PREVIEW: Editable prompt cards === */}
      {(phase === "preview" || phase === "starting") && prompts && (
        <div className="w-full max-w-2xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["sarah", "mike"] as const).map((agent) => (
              <div
                key={agent}
                className="rounded-xl bg-surface border border-border p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
                      agent === "sarah" ? "bg-accent-sarah" : "bg-accent-mike"
                    }`}
                  >
                    {agent === "sarah" ? "S" : "M"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {agent === "sarah" ? "Sarah" : "Mike"}
                    </p>
                    <input
                      value={prompts[agent].role}
                      onChange={(e) => updatePrompt(agent, "role", e.target.value)}
                      disabled={phase === "starting"}
                      className="w-full text-xs text-muted bg-transparent border-none outline-none p-0 disabled:opacity-50"
                    />
                  </div>
                </div>
                <textarea
                  value={prompts[agent].prompt}
                  onChange={(e) => updatePrompt(agent, "prompt", e.target.value)}
                  disabled={phase === "starting"}
                  rows={8}
                  className="w-full rounded-lg bg-surface-elevated border border-border p-3 text-xs text-foreground/80 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 transition-all"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={phase === "starting"}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground hover:border-foreground/20 transition-all cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              disabled={phase === "starting"}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-gradient-start to-gradient-end hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-accent/25 flex items-center gap-2.5"
            >
              {phase === "starting" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                  Start Conversation
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* === ACTIVE: Call view === */}
      {phase === "active" && roomUrl && token && (
        <div className="w-full max-w-2xl space-y-6">
          <div className="rounded-2xl bg-surface border border-border p-6 shadow-lg shadow-black/5">
            <CallProvider
              roomUrl={roomUrl}
              token={token}
              onLeave={() => {
                setRoomUrl(null);
                setToken(null);
                setPhase("idle");
                setPrompts(null);
                setTopic("");
              }}
            />
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleStop}
              className="px-6 py-2.5 rounded-xl bg-danger hover:bg-danger-hover text-white text-sm font-medium transition-all cursor-pointer"
            >
              Stop Conversation
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-muted/60">
        Powered by OutRival &middot; Pipecat &middot; Daily
      </p>
    </main>
  );
}
