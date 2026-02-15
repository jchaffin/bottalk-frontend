"use client";

import { useRef } from "react";
import { VOICES, type GeneratedPrompts, type AgentVariables } from "@/lib/api";
import { Loader2, Play } from "lucide-react";
import TemplateEditor from "./TemplateEditor";

interface PromptPreviewProps {
  prompts: GeneratedPrompts;
  variables: AgentVariables;
  agentColors: [string, string];
  starting?: boolean;
  onUpdate: (slot: "agent1" | "agent2", field: "name" | "role" | "prompt" | "voice_id", value: string) => void;
  onVariableChange: (slot: "agent1" | "agent2", name: string, value: string) => void;
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
  onColorChange,
  onBack,
  onStart,
}: PromptPreviewProps) {
  const colorRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(["agent1", "agent2"] as const).map((slot, idx) => (
          <div
            key={slot}
            className="card p-5 flex flex-col gap-3"
          >
            <div className="flex items-center gap-3">
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
                <input
                  value={prompts[slot].name}
                  onChange={(e) => onUpdate(slot, "name", e.target.value)}
                  disabled={starting}
                  placeholder="Agent name"
                  className="input-inline text-sm font-semibold text-foreground"
                />
                <input
                  value={prompts[slot].role}
                  onChange={(e) => onUpdate(slot, "role", e.target.value)}
                  disabled={starting}
                  placeholder="Role"
                  className="input-inline text-xs text-muted"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <TemplateEditor
                value={prompts[slot].prompt}
                variables={variables[slot]}
                onTextChange={(text) => onUpdate(slot, "prompt", text)}
                onVariableChange={(name, val) => onVariableChange(slot, name, val)}
                disabled={starting}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Voice</label>
              <select
                value={prompts[slot].voice_id || ""}
                onChange={(e) => onUpdate(slot, "voice_id", e.target.value)}
                disabled={starting}
                className="input-bordered cursor-pointer"
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
