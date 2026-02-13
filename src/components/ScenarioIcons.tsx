import { TrendingUp, Headset, Compass, Sparkles } from "lucide-react";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  sales: TrendingUp,
  support: Headset,
  discovery: Compass,
};

export default function ScenarioIcon({ slug }: { slug?: string }) {
  const Icon = (slug && ICON_MAP[slug]) || Sparkles;
  return <Icon className="w-5 h-5" />;
}
