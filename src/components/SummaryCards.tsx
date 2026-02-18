"use client";

import { MessageSquare, Radio, BarChart3, Brain } from "lucide-react";

interface SummaryCardsProps {
  totalSessions: number;
  totalConversations: number;
  totalMetricPoints: number;
  classifiedCount: number;
}

export default function SummaryCards({
  totalSessions,
  totalConversations,
  totalMetricPoints,
  classifiedCount,
}: SummaryCardsProps) {
  const cards = [
    {
      label: "Total Sessions",
      value: totalSessions,
      icon: <Radio className="w-4 h-4" />,
      color: "#686EFF",
    },
    {
      label: "Conversations",
      value: totalConversations,
      icon: <MessageSquare className="w-4 h-4" />,
      color: "#22c55e",
    },
    {
      label: "Metric Points",
      value: totalMetricPoints,
      icon: <BarChart3 className="w-4 h-4" />,
      color: "#f59e0b",
    },
    {
      label: "Classified (Pinecone)",
      value: classifiedCount,
      icon: <Brain className="w-4 h-4" />,
      color: "#8b5cf6",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="card p-4 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${card.color}15`, color: card.color }}
          >
            {card.icon}
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            <p className="text-[11px] text-muted">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
