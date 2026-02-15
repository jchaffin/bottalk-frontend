"use client";

import { useRef } from "react";

interface AgentAvatarProps {
  name: string;
  initial: string;
  /** Hex color string for the avatar background (e.g. "#686EFF"). */
  color: string;
  speaking: boolean;
  /** When provided, clicking the avatar opens the native color picker. */
  onColorChange?: (color: string) => void;
}

export default function AgentAvatar({
  name,
  initial,
  color,
  speaking,
  onColorChange,
}: AgentAvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role={onColorChange ? "button" : undefined}
        tabIndex={onColorChange ? 0 : undefined}
        onClick={onColorChange ? () => inputRef.current?.click() : undefined}
        onKeyDown={onColorChange ? (e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); } : undefined}
        style={{ backgroundColor: color }}
        className={`
          avatar-badge relative w-20 h-20 rounded-2xl text-2xl
          transition-all duration-300
          ${onColorChange ? "cursor-pointer hover:scale-105" : ""}
          ${speaking
            ? "shadow-[0_0_0_3px_var(--ring),0_0_20px_var(--ring)] scale-105"
            : "shadow-lg shadow-shadow-color"
          }
        `}
      >
        {initial}
        {speaking && (
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-success border-2 border-background" />
        )}
      </div>

      {onColorChange && (
        <input
          ref={inputRef}
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-label={`Pick color for ${name}`}
        />
      )}

      <span className="text-sm font-semibold text-foreground">{name}</span>
    </div>
  );
}
