"use client";

import { useState, useEffect, useRef } from "react";
import {
  generatePrompts,
  collectDefaults,
  scenarioToPrompts,
  startConversation,
  startQuickCall,
  stopConversation,
  syncVariables,
  voiceForName,
  nameForVoice,
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
  type GeneratedPrompts,
  type AgentVariables,
  type Scenario,
} from "@/lib/api";
import { replaceVariables, DEFAULT_AGENT_COLORS, DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME, SYSTEM_AGENT_LABEL, USER_AGENT_LABEL } from "@/lib/config";
import ScenarioPicker from "@/components/ScenarioPicker";
import CustomTopicForm from "@/components/CustomTopicForm";
import PromptPreview from "@/components/PromptPreview";
import ActiveCall from "@/components/ActiveCall";
import type { TurnMetric } from "@/components/CallProvider";

type Phase = "idle" | "generating" | "preview" | "starting" | "active";

interface HomeClientProps {
  scenarios: Scenario[];
}

export default function HomeClient({ scenarios }: HomeClientProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [customTopic, setCustomTopic] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [prompts, setPrompts] = useState<GeneratedPrompts | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null);
  const [variables, setVariables] = useState<AgentVariables>({ agent1: {}, agent2: {} });
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agentSessions, setAgentSessions] = useState<string[] | undefined>();
  const [agentColors, setAgentColors] = useState<[string, string]>(DEFAULT_AGENT_COLORS);
  const [error, setError] = useState<string | null>(null);
  const collectedMetricsRef = useRef<TurnMetric[]>([]);

  // ── Bootstrap: register cleanup ─────────────────────────────────
  useEffect(() => {
    const cleanup = () => { stopConversation().catch(() => {}); };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────

  function handlePickScenario(scenario: Scenario) {
    setError(null);
    setScenarioLabel(scenario.title);
    const raw = scenarioToPrompts(scenario);
    // Sync name from voice (name is linked to voice)
    const prompts: GeneratedPrompts = {
      agent1: { ...raw.agent1, name: nameForVoice(raw.agent1.voice_id || DEFAULT_VOICE_1) || raw.agent1.name },
      agent2: { ...raw.agent2, name: nameForVoice(raw.agent2.voice_id || DEFAULT_VOICE_2) || raw.agent2.name },
    };
    const defaults = collectDefaults(scenario);
    setVariables({
      agent1: { ...defaults.agent1, name: prompts.agent1.name },
      agent2: { ...defaults.agent2, name: prompts.agent2.name },
    });
    setPrompts(prompts);
    setPhase("preview");
  }

  async function handleGenerateCustom() {
    setError(null);
    setPhase("generating");
    try {
      const result = await generatePrompts(customTopic.trim());
      result.agent1.voice_id = voiceForName(result.agent1.name) || DEFAULT_VOICE_1;
      result.agent2.voice_id = voiceForName(result.agent2.name) || DEFAULT_VOICE_2;
      // Name is linked to voice
      result.agent1.name = nameForVoice(result.agent1.voice_id) || result.agent1.name;
      result.agent2.name = nameForVoice(result.agent2.voice_id) || result.agent2.name;
      const shared = { topic: customTopic.trim() };
      setVariables({
        agent1: { ...shared, ...(result.agent1.defaults ?? {}), name: result.agent1.name },
        agent2: { ...shared, ...(result.agent2.defaults ?? {}), name: result.agent2.name },
      });
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
      const resolvedPrompt1 = replaceVariables(prompts.agent1.prompt, variables.agent1);
      const resolvedPrompt2 = replaceVariables(prompts.agent2.prompt, variables.agent2);
      const res = await startConversation({
        agents: [
          { name: prompts.agent1.name, role: prompts.agent1.role, prompt: resolvedPrompt1, voice_id: prompts.agent1.voice_id || DEFAULT_VOICE_1 },
          { name: prompts.agent2.name, role: prompts.agent2.role, prompt: resolvedPrompt2, voice_id: prompts.agent2.voice_id || DEFAULT_VOICE_2 },
        ],
      });
      setRoomUrl(res.roomUrl);
      setToken(res.token);
      setAgentSessions(res.agentSessions);
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setPhase("preview");
    }
  }

  async function handleQuickStart() {
    setError(null);
    setScenarioLabel(`Quick Start — ${DEFAULT_AGENT_1_NAME} & ${DEFAULT_AGENT_2_NAME}`);
    setPhase("starting");
    try {
      const res = await startQuickCall();
      setRoomUrl(res.roomUrl);
      setToken(res.token);
      setAgentSessions(res.agentSessions);
      setPrompts({
        agent1: { name: DEFAULT_AGENT_1_NAME, role: "Sales Rep", prompt: "(using default)", voice_id: DEFAULT_VOICE_1 },
        agent2: { name: DEFAULT_AGENT_2_NAME, role: "Customer", prompt: "(using default)", voice_id: DEFAULT_VOICE_2 },
      });
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setPhase("idle");
    }
  }

  function resetState() {
    setRoomUrl(null);
    setToken(null);
    setAgentSessions(undefined);
    setPhase("idle");
    setPrompts(null);
    setScenarioLabel(null);
    setVariables({ agent1: {}, agent2: {} });
    setAgentColors(DEFAULT_AGENT_COLORS);
    setShowCustom(false);
    setCustomTopic("");
  }

  async function handleStop() {
    try { await stopConversation(); } catch { /* best-effort */ }
    finally { resetState(); }
  }

  function handleBack() {
    setPrompts(null);
    setScenarioLabel(null);
    setVariables({ agent1: {}, agent2: {} });
    setAgentColors(DEFAULT_AGENT_COLORS);
    setPhase("idle");
  }

  function updateAgent(
    slot: "agent1" | "agent2",
    field: "name" | "role" | "prompt" | "rules" | "voice_id",
    value: string,
  ) {
    if (!prompts) return;
    const oldName = prompts[slot].name;
    const updated = { ...prompts[slot], [field]: value };

    // Name is linked to voice — when voice changes, update name
    if (field === "voice_id") {
      const voiceName = nameForVoice(value);
      if (voiceName) {
        updated.name = voiceName;
        if (oldName && oldName !== voiceName) {
          updated.prompt = updated.prompt.replaceAll(oldName, voiceName);
        }
        setVariables((prev) => ({ ...prev, [slot]: { ...prev[slot], name: voiceName } }));
      }
    }
    setPrompts({ ...prompts, [slot]: updated });
  }

  // ── Derived values ───────────────────────────────────────────────────

  const agentNames: [string, string] = prompts
? [prompts.agent1.name, prompts.agent2.name]
        : [SYSTEM_AGENT_LABEL, USER_AGENT_LABEL];

  const subtitle =
    phase === "active" && scenarioLabel
      ? scenarioLabel
      : phase === "preview" || phase === "starting"
        ? scenarioLabel
          ? `${agentNames[0]} & ${agentNames[1]} — ${scenarioLabel}`
          : `${agentNames[0]} & ${agentNames[1]}`
        : "Pick a scenario or describe your own — then watch two AI voice agents have a real-time conversation.";

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16 gap-10">
      {/* Header */}
      <div className="text-center space-y-4">
        <a
          href="https://bottalk.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-4xl sm:text-5xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display), Duran, sans-serif" }}
        >
          bottalk <span className="font-light">Technical Project</span>
        </a>
        <p className="text-lg text-muted max-w-xl mx-auto">{subtitle}</p>
      </div>

      {/* Quick Start */}
      {phase === "idle" && !showCustom && (
        <button
          onClick={handleQuickStart}
          className="px-6 py-3 rounded-xl bg-accent-agent1 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Quick Start — {DEFAULT_AGENT_1_NAME} &amp; {DEFAULT_AGENT_2_NAME}
        </button>
      )}

      {/* Scenario picker */}
      {(phase === "idle" || phase === "generating") && !showCustom && (
        <ScenarioPicker
          scenarios={scenarios}
          disabled={phase === "generating"}
          onPick={handlePickScenario}
          onCustom={() => setShowCustom(true)}
        />
      )}

      {/* Custom topic form */}
      {(phase === "idle" || phase === "generating") && showCustom && (
        <CustomTopicForm
          topic={customTopic}
          generating={phase === "generating"}
          onTopicChange={setCustomTopic}
          onGenerate={handleGenerateCustom}
          onBack={() => { setShowCustom(false); setCustomTopic(""); setError(null); }}
        />
      )}

      {/* Prompt preview / editor */}
      {(phase === "preview" || phase === "starting") && prompts && (
        <PromptPreview
          prompts={prompts}
          variables={variables}
          agentColors={agentColors}
          starting={phase === "starting"}
          onUpdate={updateAgent}
          onVariableChange={(slot, name, val) => {
            setVariables((prev) => ({ ...prev, [slot]: { ...prev[slot], [name]: val } }));
            // name is linked to voice — don't update agent from template name edits
          }}
          onSyncVariables={async () => {
            const synced = await syncVariables(variables);
            setVariables(synced);
          }}
          onColorChange={(idx, color) => setAgentColors((prev) => { const next = [...prev] as [string, string]; next[idx] = color; return next; })}
          onBack={handleBack}
          onStart={handleStart}
        />
      )}

      {/* Active call */}
      {(phase === "active" || phase === "starting") && ((roomUrl && token) || phase === "starting") && (
        <>
        <ActiveCall
          roomUrl={roomUrl}
          token={token}
          agentSessions={agentSessions}
          agentNames={agentNames}
          agentColors={agentColors}
          scenarioLabel={scenarioLabel}
          starting={phase === "starting"}
          onTranscript={() => {}}
          onMetrics={(metrics) => {
            collectedMetricsRef.current = metrics;
          }}
          onLeave={resetState}
          onStop={handleStop}
        />
        </>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-muted/30 tracking-wide">
        &copy; {new Date().getFullYear()} Jacob Chaffin &middot; bottalk. All rights reserved.
      </p>
    </main>
  );
}