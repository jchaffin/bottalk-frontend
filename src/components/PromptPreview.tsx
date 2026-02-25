"use client";

import { useRef } from "react";
import { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2, nameForVoice, type GeneratedPrompts, type AgentVariables } from "@/lib/api";
import { Loader2, Play } from "lucide-react";
import TemplateEditor from "./TemplateEditor";

interface PromptPreviewProps {
  prompts: GeneratedPrompts;
  variables: AgentVariables;
  agentColors: [string, string];
  starting?: boolean;
  onUpdate: (slot: "agent1" | "agent2", field: "name" | "role" | "prompt" | "rules" | "voice_id", value: string) => void;
  onVariableChange: (slot: "agent1" | "agent2", name: string, value: string) => void;
  onSyncVariables: () => void | Promise<void>;
  onColorChange: (idx: number, color: string) => void;
  onBack: () => void;
  onStart: () => void;
}

/** Side-by-side editable agent prompt cards with voice pickers and start/back actions. */
export default function PromptPreview({
  prompts,
  variables,
  agentColors,
  starting,
  onUpdate,
  onVariableChange,
  onSyncVariables,
  onColorChange,
  onBack,
  onStart,
}: PromptPreviewProps) {
  const colorRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="card p-5 overflow-visible">
        {/* Row-based grid so Rules and Voice align across columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 sm:gap-y-0 sm:items-start">
          {/* Row 1: Headers */}
          {(["agent1", "agent2"] as const).map((slot, idx) => (
            <div key={`header-${slot}`} className="flex items-center gap-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => colorRefs[idx].current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") colorRefs[idx].current?.click(); }}
                style={{ backgroundColor: agentColors[idx] }}
                className="avatar-badge w-10 h-10 text-sm cursor-pointer hover:scale-105 transition-transform"
              >
                {prompts[slot].name?.[0]?.toUpperCase() || (idx + 1)}
                <input
                  ref={colorRefs[idx]}
                  type="color"
                  value={agentColors[idx]}
                  onChange={(e) => onColorChange(idx, e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label={`Pick color for ${prompts[slot].name}`}
                />
              </div>
              <div className="flex-1 space-y-1">
                <span className="block text-sm font-semibold text-foreground">
                  {nameForVoice(prompts[slot].voice_id || (slot === "agent1" ? DEFAULT_VOICE_1 : DEFAULT_VOICE_2)) || prompts[slot].name || `Agent ${idx + 1}`}
                </span>
                <input
                  value={prompts[slot].role}
                  onChange={(e) => onUpdate(slot, "role", e.target.value)}
                  disabled={starting}
                  placeholder="Role"
                  className="input-inline text-xs text-muted"
                />
              </div>
            </div>
          ))}
          {/* Row 2: Prompts */}
          {(["agent1", "agent2"] as const).map((slot) => (
            <div key={`prompt-${slot}`} className="min-h-[140px] sm:pt-4">
              <label className="text-xs text-muted mb-1 block">Prompt</label>
              <TemplateEditor
                value={prompts[slot].prompt}
                variables={variables[slot]}
                onTextChange={(text) => onUpdate(slot, "prompt", text)}
                onVariableChange={(name, val) => onVariableChange(slot, name, val)}
                onSyncVariables={onSyncVariables}
                disabled={starting}
              />
            </div>
          ))}
          {/* Row 3: Rules - aligned */}
          {(["agent1", "agent2"] as const).map((slot) => (
            <div key={`rules-${slot}`} className="sm:pt-4">
              <label className="text-xs text-muted mb-1 block">Rules</label>
              <textarea
                value={prompts[slot].rules ?? ""}
                onChange={(e) => onUpdate(slot, "rules", e.target.value)}
                disabled={starting}
                placeholder="e.g. - 2-3 short sentences per turn&#10;- Be empathetic and solution-oriented"
                rows={4}
                className="input-bordered w-full resize-none font-mono text-xs"
              />
            </div>
          ))}
          {/* Row 4: Voice - aligned (name is derived from voice) */}
          {(["agent1", "agent2"] as const).map((slot) => (
            <div key={`voice-${slot}`} className="sm:pt-4 relative z-10">
              <label className="text-xs text-muted mb-1 block">Voice</label>
              <select
                value={prompts[slot].voice_id || (slot === "agent1" ? DEFAULT_VOICE_1 : DEFAULT_VOICE_2)}
                onChange={(e) => {
                  const voiceId = e.target.value;
                  onUpdate(slot, "voice_id", voiceId);
                }}
                disabled={starting}
                className="input-bordered cursor-pointer w-full"
                aria-label={`Voice for agent ${slot === "agent1" ? 1 : 2}`}
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={starting}
          className="btn-secondary"
        >
          Back
        </button>
        <button
          onClick={onStart}
          disabled={starting}
          className="btn-primary"
        >
          {starting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" fill="currentColor" />
              Start Conversation
            </>
          )}
        </button>
      </div>
    </div>
  );
}
