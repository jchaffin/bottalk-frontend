"use client";

interface AgentAvatarProps {
  name: string;
  initial: string;
  color: string;       // Tailwind bg class, e.g. "bg-blue-800"
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
          w-20 h-20 rounded-full flex items-center justify-center
          text-3xl font-semibold text-white transition-shadow duration-200
          ${color}
          ${speaking ? "shadow-[0_0_0_4px_rgba(100,200,255,0.6)]" : ""}
        `}
      >
        {initial}
      </div>
      <span className="text-sm font-semibold text-gray-200">{name}</span>
    </div>
  );
}
