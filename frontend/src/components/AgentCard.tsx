import React from "react";
import { Clock, Cpu, Database, DollarSign } from "lucide-react";
import type { Agent } from "../api";

interface AgentCardProps {
  agent: Agent;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return "Never";
  try {
    const ts = new Date(isoString).getTime();
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "Unknown";
  }
}

const COLOR_MAP: Record<string, { border: string; glow: string }> = {
  orange: { border: "border-orange-500/40", glow: "shadow-[0_0_6px_2px_rgba(249,115,22,0.4)]" },
  green:  { border: "border-green-500/40",  glow: "shadow-[0_0_6px_2px_rgba(74,222,128,0.4)]" },
  blue:   { border: "border-blue-500/40",   glow: "shadow-[0_0_6px_2px_rgba(59,130,246,0.4)]" },
  purple: { border: "border-purple-500/40", glow: "shadow-[0_0_6px_2px_rgba(168,85,247,0.4)]" },
};

export default function AgentCard({ agent }: AgentCardProps) {
  const isActive = agent.status === "active";
  const colors = COLOR_MAP[agent.color ?? "blue"] ?? COLOR_MAP.blue;

  return (
    <div
      className={`bg-gray-800 rounded-xl p-5 border transition-colors ${
        isActive ? colors.border : "border-gray-700/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isActive ? `bg-green-400 ${colors.glow}` : "bg-gray-500"
            }`}
          />
          <h3 className="text-base font-semibold text-white">{agent.name}</h3>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isActive
              ? "bg-green-400/10 text-green-400"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {isActive ? "Active" : "Idle"}
        </span>
      </div>

      {/* Model */}
      <div className="flex items-center gap-2 text-gray-400 text-xs mb-4">
        <Cpu size={13} />
        <span className="font-mono">{agent.model}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900/60 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
            <Database size={12} />
          </div>
          <p className="text-lg font-bold text-white">{agent.sessions_count}</p>
          <p className="text-xs text-gray-500">Sessions</p>
        </div>

        <div className="bg-gray-900/60 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
            <DollarSign size={12} />
          </div>
          <p className="text-lg font-bold text-white">${agent.total_cost_usd.toFixed(2)}</p>
          <p className="text-xs text-gray-500">Cost</p>
        </div>

        <div className="bg-gray-900/60 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
            <Clock size={12} />
          </div>
          <p className="text-sm font-bold text-white leading-tight">
            {timeAgo(agent.last_active)}
          </p>
          <p className="text-xs text-gray-500">Last seen</p>
        </div>
      </div>
    </div>
  );
}
