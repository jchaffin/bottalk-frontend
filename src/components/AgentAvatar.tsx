"use client";

interface AgentAvatarProps {
  name: string;
  initial: string;
  color: string;
  speaking: boolean;
}

export default function AgentAvatar({
  name,
  initial,
  color,
  speaking,
}: AgentAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`
          relative w-20 h-20 rounded-2xl flex items-center justify-center
          text-2xl font-bold text-white transition-all duration-300
          ${color}
          ${speaking
            ? "shadow-[0_0_0_3px_var(--ring),0_0_20px_var(--ring)] scale-105"
            : "shadow-lg shadow-black/10"
          }
        `}
      >
        {initial}
        {speaking && (
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{name}</span>
    </div>
  );
}
