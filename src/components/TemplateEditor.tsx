"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Code, RefreshCw, SquarePen, X } from "lucide-react";
import { SHARED_VARS } from "@/lib/sync-variables";

interface TemplateEditorProps {
  value: string;
  variables: Record<string, string>;
  onTextChange: (text: string) => void;
  onVariableChange: (name: string, value: string) => void;
  onSyncVariables?: () => void | Promise<void>;
  disabled?: boolean;
}

/** Regex that splits around {{ var }} or {{ var: default }} tokens. */
const VAR_RE = /(\{\{\s*\w+(?:\s*:\s*[^}]*)?\s*\}\})/g;
/** Extract var name (and optional default) from a token. */
const VAR_TOKEN_RE = /^\{\{\s*(\w+)(?:\s*:\s*([^}]*))?\s*\}\}$/;

/**
 * A prompt editor that renders `{{variable}}` tokens as interactive chips.
 *
 * - **Default view**: rendered text with colored chips. Click a chip to edit
 *   its value in a popover.
 * - **Edit mode**: double-click (or click the edit button) to switch to a raw
 *   `<textarea>` showing `{{variable}}` syntax. Click away to return to the
 *   rendered view.
 */
export default function TemplateEditor({
  value,
  variables,
  onTextChange,
  onVariableChange,
  onSyncVariables,
  disabled = false,
}: TemplateEditorProps) {
  const [editing, setEditing] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editHeight, setEditHeight] = useState<number | null>(null);

  /** Measure the rendered view and enter edit mode. */
  const enterEdit = useCallback(() => {
    if (disabled) return;
    if (renderedRef.current) {
      setEditHeight(renderedRef.current.offsetHeight);
    }
    setEditing(true);
  }, [disabled]);

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  // Focus the popover input when a chip is clicked
  useEffect(() => {
    if (activeChip && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [activeChip]);

  // Close popover on outside click
  useEffect(() => {
    if (!activeChip) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setActiveChip(null);
        setPopoverPos(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeChip]);

  // Close popover on Escape
  useEffect(() => {
    if (!activeChip) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveChip(null);
        setPopoverPos(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeChip]);

  const handleChipClick = useCallback(
    (varName: string, chipEl: HTMLSpanElement) => {
      if (disabled) return;
      if (varName === "name") return; // Name is derived from voice — not editable
      const containerRect = containerRef.current?.getBoundingClientRect();
      const chipRect = chipEl.getBoundingClientRect();
      if (containerRect) {
        setPopoverPos({
          top: chipRect.bottom - containerRect.top + 6,
          left: chipRect.left - containerRect.left,
        });
      }
      setActiveChip(varName);
    },
    [disabled],
  );

  const handleExitEdit = useCallback(() => {
    setEditing(false);
  }, []);

  // Split value into segments of text and variable tokens
  const segments = value.split(VAR_RE);

  return (
    <div ref={containerRef} className="relative h-full">
      {editing ? (
        /* --- Raw textarea edit mode --- */
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={handleExitEdit}
          disabled={disabled}
          style={editHeight ? { height: editHeight } : undefined}
          className="input-bordered p-3 leading-relaxed resize-none font-mono h-full border-accent/40"
        />
      ) : (
        /* --- Rendered view with chips --- */
        <div
          ref={renderedRef}
          onDoubleClick={enterEdit}
          className="w-full h-full rounded-lg bg-surface-elevated border border-border p-4 text-xs text-foreground/80 leading-loose min-h-[8rem] sm:min-h-[20rem] cursor-text whitespace-pre-wrap break-words transition-all hover:border-border/80"
        >
          {segments.map((segment, i) => {
            const match = segment.match(VAR_TOKEN_RE);
            if (match) {
              const varName = match[1];
              const inlineDefault = match[2]?.trim();
              const displayValue = variables[varName] ?? inlineDefault ?? varName;
              const hasValue = (varName in variables && variables[varName] !== "") || !!inlineDefault;
              return (
                <span
                  key={`${varName}-${i}`}
                  onClick={(e) => varName !== "name" && handleChipClick(varName, e.currentTarget)}
                  title={
                    hasValue
                      ? `${varName} = ${displayValue}`
                      : `${varName} (click to set value)`
                  }
                  className={`
                    inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md
                    text-[11px] leading-none font-medium select-none
                    transition-all
                    ${varName === "name" ? "cursor-default" : "cursor-pointer hover:scale-105"}
                    ${
                      hasValue
                        ? "bg-accent/15 text-foreground border border-accent/30 hover:bg-accent/25"
                        : "bg-accent-agent2/15 text-foreground border border-accent-agent2/30 hover:bg-accent-agent2/25"
                    }
                  `}
                >
                  <Code className="w-2.5 h-2.5 opacity-60" strokeWidth={2.5} />
                  {displayValue}
                </span>
              );
            }
            return <span key={i}>{segment}</span>;
          })}

          {/* Edit hint */}
          {!disabled && (
            <button
              onClick={enterEdit}
              className="absolute top-2 right-2 p-1 rounded-md text-muted/30 hover:text-muted/60 hover:bg-surface transition-all"
              title="Edit raw prompt"
            >
              <SquarePen className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* --- Variable popover --- */}
      {activeChip && popoverPos && !editing && (
        <div
          ref={popoverRef}
          className="absolute z-50 bg-surface border border-border rounded-xl shadow-lg shadow-shadow-color p-3 space-y-2 left-0 right-0"
          style={{ top: popoverPos.top }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-muted/60">
              {activeChip}
            </span>
            <div className="flex items-center gap-1">
              {onSyncVariables && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!SHARED_VARS.includes(activeChip as (typeof SHARED_VARS)[number])) return;
                    setSyncing(true);
                    try {
                      await onSyncVariables();
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  disabled={
                    disabled ||
                    syncing ||
                    !SHARED_VARS.includes(activeChip as (typeof SHARED_VARS)[number])
                  }
                  title={
                    SHARED_VARS.includes(activeChip as (typeof SHARED_VARS)[number])
                      ? "Sync across both agents"
                      : "Not available for this variable"
                  }
                  className="p-1 rounded text-muted/40 hover:text-muted/80 hover:bg-surface-elevated disabled:opacity-50 transition-colors"
                >
                  <RefreshCw
                    className={"w-3.5 h-3.5" + (syncing ? " animate-spin" : "")}
                    strokeWidth={2.5}
                  />
                </button>
              )}
              <button
                onClick={() => {
                  setActiveChip(null);
                  setPopoverPos(null);
                }}
                className="p-1 rounded text-muted/40 hover:text-muted/80 transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <textarea
            ref={inputRef}
            value={variables[activeChip] ?? ""}
            onChange={(e) => onVariableChange(activeChip, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                setActiveChip(null);
                setPopoverPos(null);
              }
            }}
            rows={3}
            placeholder={"Value for " + activeChip}
            className="input-bordered w-full px-2.5 py-2 text-foreground text-sm resize-none"
          />
        </div>
      )}
    </div>
  );
}
