"use client";

import { useState } from "react";
import scenarioData from "../lib/scenarios.json";
import {
  generatePrompts,
  startConversation,
  stopConversation,
  voiceForName,
  nameForVoice,
  VOICES,
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
  type GeneratedPrompts,
} from "../lib/api";
import CallProvider from "../components/CallProvider";

type Phase = "idle" | "generating" | "preview" | "starting" | "active";

interface ScenarioMeta {
  key: string;
  title: string;
  description: string;
}

const scenarios: ScenarioMeta[] = Object.entries(
  scenarioData.scenarios as Record<string, { title: string; description: string }>
).map(([key, s]) => ({ key, title: s.title, description: s.description }));

/** Convert a scenario from scenarios.json into editable prompts. */
function scenarioToPrompts(key: string): GeneratedPrompts {
  const s = (scenarioData.scenarios as Record<string, any>)[key];
  const a1 = s.agents[0];
  const a2 = s.agents[1];
  return {
    agent1: {
      name: a1.name,
      role: a1.role,
      prompt: a1.prompt.replace(/\{\{topic\}\}/g, s.title),
      voice_id: a1.voice_id || voiceForName(a1.name) || DEFAULT_VOICE_1,
    },
    agent2: {
      name: a2.name,
      role: a2.role,
      prompt: a2.prompt.replace(/\{\{topic\}\}/g, s.title),
      voice_id: a2.voice_id || voiceForName(a2.name) || DEFAULT_VOICE_2,
    },
  };
}

const SCENARIO_ICONS: Record<string, string> = {
  sales: "S",
  support: "C",
  discovery: "D",
};

const AGENT_COLORS = ["bg-accent-agent1", "bg-accent-agent2"] as const;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [customTopic, setCustomTopic] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [prompts, setPrompts] = useState<GeneratedPrompts | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePickScenario(key: string) {
    setError(null);
    setPrompts(scenarioToPrompts(key));
    setPhase("preview");
  }

  async function handleGenerateCustom() {
    if (customTopic.trim().length < 5) {
      setError("Topic must be at least 5 characters.");
      return;
    }
    setError(null);
    setPhase("generating");
    try {
      const result = await generatePrompts(customTopic.trim());
      // Match voice to name if possible, otherwise use defaults
      result.agent1.voice_id = voiceForName(result.agent1.name) || DEFAULT_VOICE_1;
      result.agent2.voice_id = voiceForName(result.agent2.name) || DEFAULT_VOICE_2;
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
        agents: [
          {
            name: prompts.agent1.name,
            role: prompts.agent1.role,
            prompt: prompts.agent1.prompt,
            voice_id: prompts.agent1.voice_id || DEFAULT_VOICE_1,
          },
          {
            name: prompts.agent2.name,
            role: prompts.agent2.role,
            prompt: prompts.agent2.prompt,
            voice_id: prompts.agent2.voice_id || DEFAULT_VOICE_2,
          },
        ],
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
    try { await stopConversation(); } catch { /* best-effort */ }
    finally {
      setRoomUrl(null);
      setToken(null);
      setPhase("idle");
      setPrompts(null);
      setShowCustom(false);
      setCustomTopic("");
    }
  }

  function handleBack() {
    setPrompts(null);
    setPhase("idle");
  }

  function updateAgent(
    slot: "agent1" | "agent2",
    field: "name" | "role" | "prompt" | "voice_id",
    value: string,
  ) {
    if (!prompts) return;
    const updated = { ...prompts[slot], [field]: value };
    // Name → Voice: auto-select matching voice preset
    if (field === "name") {
      const match = voiceForName(value);
      if (match) updated.voice_id = match;
    }
    // Voice → Name: auto-update name to match voice preset
    if (field === "voice_id") {
      const match = nameForVoice(value);
      if (match) updated.name = match;
    }
    setPrompts({ ...prompts, [slot]: updated });
  }

  // Agent names for the active call
  const agentNames: [string, string] = prompts
    ? [prompts.agent1.name, prompts.agent2.name]
    : ["Agent 1", "Agent 2"];

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16 gap-10">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-border text-xs font-medium text-muted mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live Demo
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          OutRival
        </h1>
        <p className="text-base text-muted max-w-lg mx-auto">
          Pick a scenario or describe your own — then watch two AI voice agents have a real-time conversation.
        </p>
      </div>

      {/* === IDLE: Scenario picker === */}
      {(phase === "idle" || phase === "generating") && !showCustom && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {scenarios.map((s) => (
              <button
                key={s.key}
                onClick={() => handlePickScenario(s.key)}
                disabled={phase === "generating"}
                className="group text-left rounded-xl bg-surface border border-border p-4 hover:border-accent/40 hover:shadow-md hover:shadow-accent/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-xs font-bold group-hover:bg-accent/20 transition-colors">
                    {SCENARIO_ICONS[s.key] || s.title[0]}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{s.title}</p>
                </div>
                <p className="text-xs text-muted leading-relaxed">{s.description}</p>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-muted/40">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={() => setShowCustom(true)}
            disabled={phase === "generating"}
            className="w-full text-left rounded-xl border border-dashed border-border hover:border-accent/40 p-4 transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border text-muted flex items-center justify-center text-sm group-hover:text-accent group-hover:border-accent/30 transition-colors">
                +
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Custom Scenario</p>
                <p className="text-xs text-muted">Describe any topic and we&apos;ll generate the roles</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* === IDLE + CUSTOM: Topic input === */}
      {(phase === "idle" || phase === "generating") && showCustom && (
        <div className="w-full max-w-xl space-y-4">
          <textarea
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value.slice(0, 500))}
            placeholder="Describe the conversation... e.g. 'A job interview for a senior React developer position at a fast-growing startup'"
            rows={3}
            disabled={phase === "generating"}
            className="w-full rounded-xl bg-surface border border-border p-4 text-sm text-foreground placeholder:text-muted/60 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 transition-all"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowCustom(false); setCustomTopic(""); setError(null); }}
                disabled={phase === "generating"}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground hover:border-foreground/20 transition-all cursor-pointer disabled:opacity-50"
              >
                Back
              </button>
              <span className="text-xs text-muted/50 font-mono">
                {customTopic.length}/500
              </span>
            </div>
            <button
              onClick={handleGenerateCustom}
              disabled={phase === "generating" || customTopic.trim().length < 5}
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
            {(["agent1", "agent2"] as const).map((slot, idx) => (
              <div
                key={slot}
                className="rounded-xl bg-surface border border-border p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${AGENT_COLORS[idx]}`}
                  >
                    {prompts[slot].name?.[0]?.toUpperCase() || (idx + 1)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      value={prompts[slot].name}
                      onChange={(e) => updateAgent(slot, "name", e.target.value)}
                      disabled={phase === "starting"}
                      placeholder="Agent name"
                      className="w-full text-sm font-semibold text-foreground bg-transparent border-none outline-none p-0 disabled:opacity-50"
                    />
                    <input
                      value={prompts[slot].role}
                      onChange={(e) => updateAgent(slot, "role", e.target.value)}
                      disabled={phase === "starting"}
                      placeholder="Role"
                      className="w-full text-xs text-muted bg-transparent border-none outline-none p-0 disabled:opacity-50"
                    />
                  </div>
                </div>
                <textarea
                  value={prompts[slot].prompt}
                  onChange={(e) => updateAgent(slot, "prompt", e.target.value)}
                  disabled={phase === "starting"}
                  rows={8}
                  className="w-full rounded-lg bg-surface-elevated border border-border p-3 text-xs text-foreground/80 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 transition-all"
                />
                <div>
                  <label className="text-xs text-muted mb-1 block">Voice</label>
                  <select
                    value={prompts[slot].voice_id || ""}
                    onChange={(e) => updateAgent(slot, "voice_id", e.target.value)}
                    disabled={phase === "starting"}
                    className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-xs text-foreground/80 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                </div>
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
              agentNames={agentNames}
              onLeave={() => {
                setRoomUrl(null);
                setToken(null);
                setPhase("idle");
                setPrompts(null);
                setShowCustom(false);
                setCustomTopic("");
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
