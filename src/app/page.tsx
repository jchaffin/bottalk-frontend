"use client";

import { useState, useEffect } from "react";
import {
  fetchScenarios,
  generatePrompts,
  saveTranscript,
  startConversation,
  stopConversation,
  voiceForName,
  nameForVoice,
  VOICES,
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
  type GeneratedPrompts,
  type Scenario,
} from "@/lib/api";
import { AGENT_COLORS, TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH, extractVariables, replaceVariables } from "@/lib/config";
import CallProvider from "@/components/CallProvider";

import ScenarioIcon from "@/components/ScenarioIcons";

type Phase = "idle" | "generating" | "preview" | "starting" | "active";

/** Collect default variable values from both agents in a scenario. */
function collectDefaults(scenario: Scenario): Record<string, string> {
  const defaults: Record<string, string> = { topic: scenario.title };
  for (const agent of scenario.agents) {
    if (agent.defaults) Object.assign(defaults, agent.defaults);
  }
  return defaults;
}

/** Convert a DB scenario into editable prompts (keeps {{variables}} intact). */
function scenarioToPrompts(scenario: Scenario): GeneratedPrompts {
  const a1 = scenario.agents[0];
  const a2 = scenario.agents[1];
  return {
    agent1: {
      name: a1.name,
      role: a1.role,
      prompt: a1.prompt,
      voice_id: a1.voice_id || voiceForName(a1.name) || DEFAULT_VOICE_1,
      defaults: a1.defaults,
    },
    agent2: {
      name: a2.name,
      role: a2.role,
      prompt: a2.prompt,
      voice_id: a2.voice_id || voiceForName(a2.name) || DEFAULT_VOICE_2,
      defaults: a2.defaults,
    },
  };
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [prompts, setPrompts] = useState<GeneratedPrompts | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios()
      .then(setScenarios)
      .catch((err) => console.error("Failed to load scenarios:", err));

    // Kill any orphaned sessions on page load
    stopConversation().catch(() => {});

    // Kill sessions if user closes/refreshes the tab
    const cleanup = () => { stopConversation().catch(() => {}); };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  function handlePickScenario(scenario: Scenario) {
    setError(null);
    setScenarioLabel(scenario.title);
    setPrompts(scenarioToPrompts(scenario));
    setVariables(collectDefaults(scenario));
    setPhase("preview");
  }

  async function handleGenerateCustom() {
    if (customTopic.trim().length < TOPIC_MIN_LENGTH) {
      setError(`Topic must be at least ${TOPIC_MIN_LENGTH} characters.`);
      return;
    }
    setError(null);
    setPhase("generating");
    try {
      const result = await generatePrompts(customTopic.trim());
      // Match voice to name if possible, otherwise use defaults
      result.agent1.voice_id = voiceForName(result.agent1.name) || DEFAULT_VOICE_1;
      result.agent2.voice_id = voiceForName(result.agent2.name) || DEFAULT_VOICE_2;
      // Collect variable defaults from the generated prompts
      const defaults: Record<string, string> = { topic: customTopic.trim() };
      if (result.agent1.defaults) Object.assign(defaults, result.agent1.defaults);
      if (result.agent2.defaults) Object.assign(defaults, result.agent2.defaults);
      setVariables(defaults);
      setScenarioLabel(customTopic.trim());
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
      // Replace {{variables}} in prompts before sending to agents
      const resolvedPrompt1 = replaceVariables(prompts.agent1.prompt, variables);
      const resolvedPrompt2 = replaceVariables(prompts.agent2.prompt, variables);
      const { roomUrl, token } = await startConversation({
        agents: [
          {
            name: prompts.agent1.name,
            role: prompts.agent1.role,
            prompt: resolvedPrompt1,
            voice_id: prompts.agent1.voice_id || DEFAULT_VOICE_1,
          },
          {
            name: prompts.agent2.name,
            role: prompts.agent2.role,
            prompt: resolvedPrompt2,
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
      setScenarioLabel(null);
      setVariables({});
      setShowCustom(false);
      setCustomTopic("");
    }
  }

  function handleBack() {
    setPrompts(null);
    setScenarioLabel(null);
    setVariables({});
    setPhase("idle");
  }

  function updateAgent(
    slot: "agent1" | "agent2",
    field: "name" | "role" | "prompt" | "voice_id",
    value: string,
  ) {
    if (!prompts) return;
    const oldName = prompts[slot].name;
    const updated = { ...prompts[slot], [field]: value };

    // Name → Voice: auto-select matching voice preset
    if (field === "name") {
      const match = voiceForName(value);
      if (match) updated.voice_id = match;
      // Replace old name in prompt text
      if (oldName && value && oldName !== value) {
        updated.prompt = updated.prompt.replaceAll(oldName, value);
      }
    }
    // Voice → Name: auto-update name and prompt to match voice preset
    if (field === "voice_id") {
      const newName = nameForVoice(value);
      if (newName && newName !== oldName) {
        updated.name = newName;
        updated.prompt = updated.prompt.replaceAll(oldName, newName);
      }
    }
    setPrompts({ ...prompts, [slot]: updated });
  }

  // Agent names for the active call
  const agentNames: [string, string] = prompts
    ? [prompts.agent1.name, prompts.agent2.name]
    : ["Agent 1", "Agent 2"];

  // Detect all {{variables}} across both prompts (deduplicated, in order)
  const detectedVars = prompts
    ? [...new Set([
        ...extractVariables(prompts.agent1.prompt),
        ...extractVariables(prompts.agent2.prompt),
      ])]
    : [];

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16 gap-10">
      {/* Header */}
      <div className="text-center space-y-4">
        <a
          href="https://outrival.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-4xl sm:text-5xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-display), Duran, sans-serif' }}
        >
          OutRival <span className="font-light">Technical Project</span>
        </a>
        <p className="text-lg text-muted max-w-xl mx-auto">
          {phase === "active" && scenarioLabel
            ? scenarioLabel
            : phase === "preview" || phase === "starting"
              ? scenarioLabel
                ? `${prompts?.agent1.name || "Agent 1"} & ${prompts?.agent2.name || "Agent 2"} — ${scenarioLabel}`
                : `${prompts?.agent1.name || "Agent 1"} & ${prompts?.agent2.name || "Agent 2"}`
              : "Pick a scenario or describe your own — then watch two AI voice agents have a real-time conversation."}
        </p>
      </div>

      {/* === IDLE: Scenario picker === */}
      {(phase === "idle" || phase === "generating") && !showCustom && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => handlePickScenario(s)}
                disabled={phase === "generating"}
                className="group text-left rounded-2xl bg-surface border border-border p-5 hover:border-accent/40 hover:shadow-lg hover:shadow-shadow-accent hover:scale-[1.02] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <ScenarioIcon slug={s.slug ?? undefined} />
                  </div>
                  <p className="text-base font-semibold text-foreground">{s.title}</p>
                </div>
                <p className="text-sm text-muted leading-relaxed">{s.description}</p>
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
            className="w-full text-left rounded-2xl border border-dashed border-border hover:border-accent/40 p-5 transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border text-muted flex items-center justify-center text-sm group-hover:text-accent group-hover:border-accent/30 transition-colors">
                +
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Custom Scenario</p>
                <p className="text-sm text-muted">Describe any topic and we&apos;ll generate the roles</p>
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
            onChange={(e) => setCustomTopic(e.target.value.slice(0, TOPIC_MAX_LENGTH))}
            placeholder="Describe the conversation... e.g. 'A job interview for a senior React developer position at a fast-growing startup'"
            rows={3}
            disabled={phase === "generating"}
            className="w-full rounded-2xl bg-surface border border-border p-4 text-sm text-foreground placeholder:text-muted/60 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 transition-all"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowCustom(false); setCustomTopic(""); setError(null); }}
                disabled={phase === "generating"}
                className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-all disabled:opacity-50"
              >
                Back
              </button>
              <span className="text-xs text-muted/50">
                {customTopic.length}/{TOPIC_MAX_LENGTH}
              </span>
            </div>
            <button
              onClick={handleGenerateCustom}
              disabled={phase === "generating" || customTopic.trim().length < TOPIC_MIN_LENGTH}
              className="px-6 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2"
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
                className="rounded-2xl bg-surface border border-border p-5 space-y-3"
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

          {/* === Variables panel === */}
          {detectedVars.length > 0 && (
            <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <span className="text-sm font-semibold text-foreground">Variables</span>
                <span className="text-xs text-muted/50">Edit values used in the prompts above</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detectedVars.map((varName) => (
                  <div key={varName} className="flex items-center gap-2">
                    <label
                      className="text-xs text-muted font-mono whitespace-nowrap min-w-[100px]"
                      title={varName}
                    >
                      {varName}
                    </label>
                    <input
                      value={variables[varName] ?? ""}
                      onChange={(e) =>
                        setVariables((prev) => ({ ...prev, [varName]: e.target.value }))
                      }
                      disabled={phase === "starting"}
                      placeholder={varName}
                      className="flex-1 rounded-lg bg-surface-elevated border border-border px-2.5 py-1.5 text-xs text-foreground/80 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={phase === "starting"}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-all disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              disabled={phase === "starting"}
              className="px-6 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2.5"
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
      {(phase === "active" || phase === "starting") && ((roomUrl && token) || phase === "starting") && (
        <div className="w-full max-w-2xl space-y-6">
          {phase === "starting" && (
            <div className="flex items-center justify-center gap-3 py-8">
              <svg className="w-5 h-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-muted">Starting conversation...</span>
            </div>
          )}

          {phase === "active" && roomUrl && token && (
            <div className="rounded-2xl bg-surface border border-border p-6 shadow-xl shadow-shadow-color">
              <CallProvider
                roomUrl={roomUrl}
                token={token}
                agentNames={agentNames}
                onTranscript={(lines: any[]) => {
                  if (lines.length > 0 && scenarioLabel) {
                    saveTranscript({ title: scenarioLabel, agentNames, lines }).catch(console.error);
                  }
                }}
                onLeave={() => {
                  setRoomUrl(null);
                  setToken(null);
                  setPhase("idle");
                  setPrompts(null);
                  setScenarioLabel(null);
                  setVariables({});
                  setShowCustom(false);
                  setCustomTopic("");
                }}
              />
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={handleStop}
              disabled={phase === "starting"}
              className="px-6 py-2.5 rounded-xl bg-danger hover:bg-danger-hover disabled:opacity-50 text-white text-sm font-semibold transition-all"
            >
              Stop Conversation
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-muted/30 tracking-wide">
        &copy; {new Date().getFullYear()} Jacob Chaffin &middot; OutRival. All rights reserved.
      </p>
    </main>
  );
}
