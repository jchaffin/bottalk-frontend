"use client";

import { TrendingUp, Headset, Compass, Sparkles, type LucideIcon } from "lucide-react";
import type { Scenario } from "@/lib/api";

const SCENARIO_ICONS: Record<string, LucideIcon> = {
  sales: TrendingUp,
  support: Headset,
  discovery: Compass,
};

interface ScenarioPickerProps {
  scenarios: Scenario[];
  disabled?: boolean;
  onPick: (scenario: Scenario) => void;
  onCustom: () => void;
}

/** Grid of built-in scenario cards with a "Custom Scenario" option. */
export default function ScenarioPicker({
  scenarios,
  disabled,
  onPick,
  onCustom,
}: ScenarioPickerProps) {
  return (
    <div className="w-full min-w-0 max-w-2xl space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {scenarios.map((s) => {
          const Icon = (s.slug && SCENARIO_ICONS[s.slug]) || Sparkles;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              disabled={disabled}
              className="card group text-left p-5 hover:border-accent/40 hover:shadow-lg hover:shadow-shadow-accent hover:scale-[1.02] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-base font-semibold text-foreground">{s.title}</p>
              </div>
              <p className="text-sm text-muted leading-relaxed">{s.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-muted/40">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={onCustom}
        disabled={disabled}
        className="w-full text-left rounded-2xl border border-dashed border-border hover:border-accent/40 p-5 transition-all cursor-pointer disabled:opacity-50 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border text-muted flex items-center justify-center text-sm group-hover:text-accent group-hover:border-accent/30 transition-colors">
            +
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Custom Scenario</p>
            <p className="text-sm text-muted">Describe any topic and we&apos;ll generate the roles</p>
          </div>
        </div>
      </button>
    </div>
  );
}
