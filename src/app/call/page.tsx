"use client";

import { useState, useEffect, useRef } from "react";
import {
  generatePrompts,
  collectDefaults,
  scenarioToPrompts,
  systemPromptFromAgent,
  splitPromptAndRules,
  startConversation,
  stopConversation,
  fetchScenarios,
  voiceForName,
  nameForVoice,
  DEFAULT_VOICE_1,
  DEFAULT_VOICE_2,
  type GeneratedPrompts,
  type AgentVariables,
  type Scenario,
} from "@/lib/api";
import { syncSharedVariables } from "@/lib/sync-variables";
import { replaceVariables, DEFAULT_AGENT_COLORS, DEFAULT_AGENT_1_NAME, DEFAULT_AGENT_2_NAME, SYSTEM_AGENT_LABEL, USER_AGENT_LABEL } from "@/lib/config";
import { getCallSession, clearCallSession } from "@/lib/call-session";
import ScenarioPicker from "@/components/ScenarioPicker";
import CustomTopicForm from "@/components/CustomTopicForm";
import PromptPreview from "@/components/PromptPreview";
import ActiveCall from "@/components/ActiveCall";
import type { TurnMetric } from "@/components/CallProvider";

type Phase = "idle" | "generating" | "preview" | "starting" | "active";

export default function CallPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
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

  useEffect(() => {
    fetchScenarios().then(setScenarios).catch(console.error);
  }, []);

  // Restore active call from nav quick start (stored in sessionStorage)
  useEffect(() => {
    const session = getCallSession();
    if (session) {
      setRoomUrl(session.roomUrl);
      setToken(session.token);
      setAgentSessions(session.agentSessions);
      setAgentColors(session.agentColors);
      setScenarioLabel(session.scenarioLabel);
      setPrompts({
        agent1: { name: session.agentNames[0], role: "", prompt: "", voice_id: "" },
        agent2: { name: session.agentNames[1], role: "", prompt: "", voice_id: "" },
      });
      setVariables({ agent1: { name: session.agentNames[0] }, agent2: { name: session.agentNames[1] } });
      setPhase("active");
    }
  }, []);

  useEffect(() => {
    const cleanup = () => { stopConversation().catch(() => {}); };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  function handlePickScenario(scenario: Scenario) {
    setError(null);
    setScenarioLabel(scenario.title);
    const raw = scenarioToPrompts(scenario);
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
      const s1 = splitPromptAndRules(result.agent1);
      const s2 = splitPromptAndRules(result.agent2);
      const voice1 = voiceForName(result.agent1.name) || DEFAULT_VOICE_1;
      const voice2 = voiceForName(result.agent2.name) || DEFAULT_VOICE_2;
      const promptsWithRules: GeneratedPrompts = {
        agent1: {
          ...result.agent1,
          prompt: s1.prompt,
          rules: s1.rules,
          voice_id: voice1,
          name: nameForVoice(voice1) || result.agent1.name,
        },
        agent2: {
          ...result.agent2,
          prompt: s2.prompt,
          rules: s2.rules,
          voice_id: voice2,
          name: nameForVoice(voice2) || result.agent2.name,
        },
      };
      const shared = { topic: customTopic.trim() };
      setVariables({
        agent1: { ...shared, ...(result.agent1.defaults ?? {}), name: promptsWithRules.agent1.name },
        agent2: { ...shared, ...(result.agent2.defaults ?? {}), name: promptsWithRules.agent2.name },
      });
      setScenarioLabel(customTopic.trim());
      setPrompts(promptsWithRules);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prompts");
      setPhase("idle");
    }
  }

  async function handleQuickStart() {
    setError(null);
    setPhase("starting");
    const defaultScenario = scenarios.find((s) => s.slug === "sales") ?? scenarios[0];
    if (!defaultScenario) {
      setError("No scenarios. Run: npm run db:seed");
      setPhase("idle");
      return;
    }
    const promptsResolved = scenarioToPrompts(defaultScenario);
    const variablesResolved = collectDefaults(defaultScenario);
    const fullPrompt1 = systemPromptFromAgent(promptsResolved.agent1);
    const fullPrompt2 = systemPromptFromAgent(promptsResolved.agent2);
    const resolvedPrompt1 = replaceVariables(fullPrompt1, variablesResolved.agent1);
    const resolvedPrompt2 = replaceVariables(fullPrompt2, variablesResolved.agent2);
    try {
      const res = await startConversation({
        agents: [
          { name: promptsResolved.agent1.name, role: promptsResolved.agent1.role, prompt: resolvedPrompt1, voice_id: promptsResolved.agent1.voice_id || DEFAULT_VOICE_1 },
          { name: promptsResolved.agent2.name, role: promptsResolved.agent2.role, prompt: resolvedPrompt2, voice_id: promptsResolved.agent2.voice_id || DEFAULT_VOICE_2 },
        ],
      });
      setRoomUrl(res.roomUrl);
      setToken(res.token);
      setAgentSessions(res.agentSessions);
      setScenarioLabel(defaultScenario.title);
      setPrompts(promptsResolved);
      setVariables(variablesResolved);
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setPhase("idle");
    }
  }

  async function handleStart() {
    if (!prompts) return;
    setError(null);
    setPhase("starting");
    try {
      const fullPrompt1 = systemPromptFromAgent(prompts.agent1);
      const fullPrompt2 = systemPromptFromAgent(prompts.agent2);
      const resolvedPrompt1 = replaceVariables(fullPrompt1, variables.agent1);
      const resolvedPrompt2 = replaceVariables(fullPrompt2, variables.agent2);
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

  function resetState() {
    clearCallSession();
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
    finally { resetState(); window.location.href = "/"; }
  }

  function handleBack() {
    setPrompts(null);
    setScenarioLabel(null);
    setVariables({ agent1: {}, agent2: {} });
    setAgentColors(DEFAULT_AGENT_COLORS);
    setPhase("idle");
  }

  function handleLeave() {
    resetState();
    window.location.href = "/";
  }

  function updateAgent(
    slot: "agent1" | "agent2",
    field: "name" | "role" | "prompt" | "rules" | "voice_id",
    value: string,
  ) {
    if (!prompts) return;
    const oldName = prompts[slot].name;
    const updated = { ...prompts[slot], [field]: value };

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

  const agentNames: [string, string] = prompts
    ? [prompts.agent1.name, prompts.agent2.name]
    : [SYSTEM_AGENT_LABEL, USER_AGENT_LABEL];

  const subtitle =
    phase === "starting" && scenarioLabel
      ? scenarioLabel
      : phase === "preview" || phase === "starting"
        ? scenarioLabel
          ? `${agentNames[0]} & ${agentNames[1]} — ${scenarioLabel}`
          : `${agentNames[0]} & ${agentNames[1]}`
        : "Choose a scenario or describe your own topic.";

  return (
    <div className="w-full min-w-0 flex flex-col items-center justify-start min-h-[50vh] px-0 sm:px-6 py-6 sm:py-16 gap-6 sm:gap-10">
      <div className="text-center space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Start a Call
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto">{subtitle}</p>
      </div>

      {phase === "idle" && !showCustom && (
        <button
          onClick={handleQuickStart}
          className="px-6 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Quick Start — {DEFAULT_AGENT_1_NAME} &amp; {DEFAULT_AGENT_2_NAME}
        </button>
      )}

      {(phase === "idle" || phase === "generating") && !showCustom && (
        <ScenarioPicker
          scenarios={scenarios}
          disabled={phase === "generating"}
          onPick={handlePickScenario}
          onCustom={() => setShowCustom(true)}
        />
      )}

      {(phase === "idle" || phase === "generating") && showCustom && (
        <CustomTopicForm
          topic={customTopic}
          generating={phase === "generating"}
          onTopicChange={setCustomTopic}
          onGenerate={handleGenerateCustom}
          onBack={() => { setShowCustom(false); setCustomTopic(""); setError(null); }}
        />
      )}

      {(phase === "preview" || phase === "starting") && prompts && (
        <PromptPreview
          prompts={prompts}
          variables={variables}
          agentColors={agentColors}
          starting={phase === "starting"}
          onUpdate={updateAgent}
          onVariableChange={(slot, name, val) => {
            if (name === "name") return;
            setVariables((prev) => ({ ...prev, [slot]: { ...prev[slot], [name]: val } }));
          }}
          onSyncVariables={(sourceSlot) => {
            setVariables(syncSharedVariables(variables, sourceSlot));
          }}
          onColorChange={(idx, color) => setAgentColors((prev) => { const next = [...prev] as [string, string]; next[idx] = color; return next; })}
          onBack={handleBack}
          onStart={handleStart}
        />
      )}

      {(phase === "starting" || phase === "active") && ((roomUrl && token) || phase === "starting") && (
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
          onLeave={handleLeave}
          onStop={handleStop}
          onCallEnded={async () => {
            await stopConversation();
            handleLeave();
          }}
        />
      )}

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-error-bg border border-error-border">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
