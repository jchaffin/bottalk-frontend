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
  const [variables, setVariables] = useState<AgentVariables>({ system: {}, user: {} });
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
        system: { name: session.agentNames[0], role: "", prompt: "", voice_id: "" },
        user: { name: session.agentNames[1], role: "", prompt: "", voice_id: "" },
      });
      setVariables({ system: { name: session.agentNames[0] }, user: { name: session.agentNames[1] } });
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
      system: { ...raw.system, name: nameForVoice(raw.system.voice_id || DEFAULT_VOICE_1) || raw.system.name },
      user: { ...raw.user, name: nameForVoice(raw.user.voice_id || DEFAULT_VOICE_2) || raw.user.name },
    };
    const defaults = collectDefaults(scenario);
    setVariables({
      system: { ...defaults.system, name: prompts.system.name },
      user: { ...defaults.user, name: prompts.user.name },
    });
    setPrompts(prompts);
    setPhase("preview");
  }

  async function handleGenerateCustom() {
    setError(null);
    setPhase("generating");
    try {
      const result = await generatePrompts(customTopic.trim());
      const s1 = splitPromptAndRules(result.system);
      const s2 = splitPromptAndRules(result.user);
      const voice1 = voiceForName(result.system.name) || DEFAULT_VOICE_1;
      const voice2 = voiceForName(result.user.name) || DEFAULT_VOICE_2;
      const promptsWithRules: GeneratedPrompts = {
        system: {
          ...result.system,
          prompt: s1.prompt,
          rules: s1.rules,
          voice_id: voice1,
          name: nameForVoice(voice1) || result.system.name,
        },
        user: {
          ...result.user,
          prompt: s2.prompt,
          rules: s2.rules,
          voice_id: voice2,
          name: nameForVoice(voice2) || result.user.name,
        },
      };
      const shared = { topic: customTopic.trim() };
      setVariables({
        system: { ...shared, ...(result.system.defaults ?? {}), name: promptsWithRules.system.name },
        user: { ...shared, ...(result.user.defaults ?? {}), name: promptsWithRules.user.name },
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
    const fullPrompt1 = systemPromptFromAgent(promptsResolved.system);
    const fullPrompt2 = systemPromptFromAgent(promptsResolved.user);
    const resolvedPrompt1 = replaceVariables(fullPrompt1, variablesResolved.system);
    const resolvedPrompt2 = replaceVariables(fullPrompt2, variablesResolved.user);
    try {
      const res = await startConversation({
        agents: [
          { name: promptsResolved.system.name, role: promptsResolved.system.role, prompt: resolvedPrompt1, voice_id: promptsResolved.system.voice_id || DEFAULT_VOICE_1 },
          { name: promptsResolved.user.name, role: promptsResolved.user.role, prompt: resolvedPrompt2, voice_id: promptsResolved.user.voice_id || DEFAULT_VOICE_2 },
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
      const fullPrompt1 = systemPromptFromAgent(prompts.system);
      const fullPrompt2 = systemPromptFromAgent(prompts.user);
      const resolvedPrompt1 = replaceVariables(fullPrompt1, variables.system);
      const resolvedPrompt2 = replaceVariables(fullPrompt2, variables.user);
      const res = await startConversation({
        agents: [
          { name: prompts.system.name, role: prompts.system.role, prompt: resolvedPrompt1, voice_id: prompts.system.voice_id || DEFAULT_VOICE_1 },
          { name: prompts.user.name, role: prompts.user.role, prompt: resolvedPrompt2, voice_id: prompts.user.voice_id || DEFAULT_VOICE_2 },
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
    setVariables({ system: {}, user: {} });
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
    setVariables({ system: {}, user: {} });
    setAgentColors(DEFAULT_AGENT_COLORS);
    setPhase("idle");
  }

  function handleLeave() {
    resetState();
    window.location.href = "/";
  }

  function updateAgent(
    slot: "system" | "user",
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
    ? [prompts.system.name, prompts.user.name]
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
