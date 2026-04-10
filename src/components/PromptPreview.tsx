"use client";

import { useRef, useState } from "react";
import { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2, nameForVoice, type GeneratedPrompts, type AgentVariables } from "@/lib/api";
import { Loader2, Play } from "lucide-react";
import TemplateEditor from "./TemplateEditor";

type Slot = "system" | "user";

interface PromptPreviewProps {
  prompts: GeneratedPrompts;
  variables: AgentVariables;
  agentColors: [string, string];
  starting?: boolean;
  onUpdate: (slot: Slot, field: "name" | "role" | "prompt" | "rules" | "voice_id", value: string) => void;
  onVariableChange: (slot: Slot, name: string, value: string) => void;
  onSyncVariables?: (sourceSlot: Slot) => void | Promise<void>;
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
  const [mobileTab, setMobileTab] = useState<Slot>("system");
  const slots: readonly Slot[] = ["system", "user"];
  return (
    <div className="w-full min-w-0 max-w-2xl space-y-6 pb-28 sm:pb-0">
      {/* Mobile: tab switcher */}
      <div className="sm:hidden flex rounded-xl border border-border bg-surface p-1 gap-1">
        {slots.map((slot, idx) => (
          <button
            key={slot}
            type="button"
            onClick={() => setMobileTab(slot)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mobileTab === slot ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{ backgroundColor: agentColors[idx], color: "white" }}
            >
              {prompts[slot].name?.[0]?.toUpperCase() || idx + 1}
            </span>
            {prompts[slot].name || `Agent ${idx + 1}`}
          </button>
        ))}
      </div>

      <div className="card p-5 overflow-visible">
        {/* Row-based grid so Rules and Voice align across columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 sm:gap-y-0 sm:items-start">
          {/* Row 1: Headers — hidden on mobile (tab shows name/avatar); on desktop show both */}
          {slots.map((slot, idx) => (
            <div
              key={`header-${slot}`}
              className="hidden sm:flex items-center gap-3"
            >
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
                <div className="flex items-center gap-2">
                  <span className="block text-sm font-semibold text-foreground">
                    {nameForVoice(prompts[slot].voice_id || (slot === "system" ? DEFAULT_VOICE_1 : DEFAULT_VOICE_2)) || prompts[slot].name || `Agent ${idx + 1}`}
                  </span>
                  <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${slot === "system" ? "bg-accent/15 text-accent" : "bg-muted/20 text-muted"}`}>
                    {slot === "system" ? "System" : "User"}
                  </span>
                </div>
                <input
                  value={prompts[slot].role}
                  onChange={(e) => onUpdate(slot, "role", e.target.value)}
                  disabled={starting}
                  placeholder={slot === "system" ? "e.g. Sales rep, Support agent" : "e.g. Customer, Candidate"}
                  className="input-inline text-xs text-muted"
                />
              </div>
            </div>
          ))}
          {/* Row 2: Prompts — on mobile only show active tab */}
          {slots.map((slot) => (
            <div
              key={`prompt-${slot}`}
              className={`min-h-[100px] sm:min-h-[140px] sm:pt-4 ${mobileTab !== slot ? "hidden sm:block" : ""}`}
            >
              <label className="text-sm font-medium text-foreground mb-1.5 block">System prompt</label>
              <TemplateEditor
                value={prompts[slot].prompt}
                variables={variables[slot]}
                onTextChange={(text) => onUpdate(slot, "prompt", text)}
                onVariableChange={(name, val) => onVariableChange(slot, name, val)}
                onSyncVariables={onSyncVariables ? () => onSyncVariables(slot) : undefined}
                disabled={starting}
              />
            </div>
          ))}
          {/* Row 3: Rules - aligned — on mobile only show active tab */}
          {slots.map((slot) => (
            <div
              key={`rules-${slot}`}
              className={`pt-6 sm:pt-4 ${mobileTab !== slot ? "hidden sm:block" : ""}`}
            >
              <label className="text-sm font-medium text-foreground mb-1.5 block">Conversation rules</label>
              <textarea
                value={prompts[slot].rules ?? ""}
                onChange={(e) => onUpdate(slot, "rules", e.target.value)}
                disabled={starting}
                placeholder="e.g.&#10;• 2–3 short sentences per turn&#10;• Be empathetic and solution-oriented"
                rows={6}
                className="input-bordered w-full resize-none font-mono text-xs"
              />
            </div>
          ))}
          {/* Row 4: Voice - aligned — on mobile only show active tab */}
          {slots.map((slot) => (
            <div
              key={`voice-${slot}`}
              className={`sm:pt-4 relative z-10 ${mobileTab !== slot ? "hidden sm:block" : ""}`}
            >
              <label className="text-sm font-medium text-foreground mb-1.5 block">Voice</label>
              <select
                value={prompts[slot].voice_id || (slot === "system" ? DEFAULT_VOICE_1 : DEFAULT_VOICE_2)}
                onChange={(e) => {
                  const voiceId = e.target.value;
                  onUpdate(slot, "voice_id", voiceId);
                }}
                disabled={starting}
                className="input-bordered cursor-pointer w-full"
                aria-label={`Voice for ${slot} agent`}
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="sm:relative fixed sm:static bottom-0 left-0 right-0 flex items-center justify-between gap-3 p-4 sm:p-0 bg-background/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t sm:border-t-0 border-border z-40">
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
