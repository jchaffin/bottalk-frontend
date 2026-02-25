"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Loader2 } from "lucide-react";
import { quickStartConversation } from "@/lib/api";
import { storeCallSession } from "@/lib/call-session";

interface QuickStartNavButtonProps {
  /** Mobile: icon-only circular button. Desktop: label + icon. */
  variant?: "default" | "icon";
}

/** Nav bar button that starts a call immediately (Quick Start) and navigates to /call/active. */
export default function QuickStartNavButton({ variant = "default" }: QuickStartNavButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const session = await quickStartConversation();
      storeCallSession(session);
      router.push("/call/active");
    } catch {
      setLoading(false);
      router.push("/call");
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors disabled:opacity-70"
        aria-label="Start Call"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      id="nav-start-call"
      data-testid="nav-start-call"
      aria-label="Start Call"
      className="text-xs font-medium text-white bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
      Start Call
    </button>
  );
}
