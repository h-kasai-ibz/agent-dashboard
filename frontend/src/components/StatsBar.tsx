import React from "react";
import { DollarSign, Layers, Zap } from "lucide-react";
import type { Stats } from "../api";

interface StatsBarProps {
  stats: Stats | null;
  loading: boolean;
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-5 py-4 flex-1 min-w-0">
      <div className="text-blue-400 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-xl font-bold text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function StatsBar({ stats, loading }: StatsBarProps) {
  if (loading || !stats) {
    return (
      <div className="flex gap-4 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 bg-gray-800 rounded-xl h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 mb-6">
      <StatItem
        icon={<DollarSign size={22} />}
        label="Total Cost"
        value={`$${stats.total_cost_usd.toFixed(4)}`}
      />
      <StatItem
        icon={<Layers size={22} />}
        label="Total Sessions"
        value={String(stats.total_sessions)}
      />
      <StatItem
        icon={<Zap size={22} />}
        label="Total Tokens"
        value={formatTokens(stats.total_tokens)}
      />
    </div>
  );
}
