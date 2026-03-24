import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Session } from "../api";

interface SessionListProps {
  sessions: Session[];
  loading: boolean;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    const ts = new Date(isoString).getTime();
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "—";
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function agentColor(agent: string): string {
  switch (agent) {
    case "claude-code":
      return "bg-blue-500/20 text-blue-400";
    case "goose":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-gray-700 text-gray-400";
  }
}

function agentLabel(agent: string): string {
  switch (agent) {
    case "claude-code":
      return "Claude";
    case "goose":
      return "Goose";
    default:
      return agent;
  }
}

function TokenRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs px-2 py-0.5 rounded font-mono ${color}`}>{label}</span>
      <span className="text-xs text-gray-300 font-mono">{formatTokens(value)}</span>
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false);
  const preview =
    session.first_message.length > 60
      ? session.first_message.slice(0, 60) + "…"
      : session.first_message || "(no message)";

  const projectDisplay = session.project.replace(/^-home-/, "~/");

  return (
    <div className="border-b border-gray-700/50 last:border-0">
      {/* Summary row */}
      <button
        className="w-full text-left px-4 py-3 hover:bg-gray-700/30 transition-colors flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="mt-0.5 text-gray-500 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${agentColor(session.agent)}`}
            >
              {agentLabel(session.agent)}
            </span>
            <span className="text-xs text-gray-400 font-mono truncate">{projectDisplay}</span>
          </div>
          <p className="text-sm text-gray-200 leading-snug">{preview}</p>
        </div>

        <div className="shrink-0 text-right ml-2 min-w-[72px]">
          <p className="text-sm font-semibold text-white">${session.cost_usd.toFixed(4)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{timeAgo(session.last_active)}</p>
        </div>
      </button>

      {/* Expanded token breakdown */}
      {expanded && (
        <div className="px-4 pb-4 bg-gray-900/40">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-3">
            <TokenRow
              label="Input"
              value={session.input_tokens}
              color="bg-blue-900/40 text-blue-300"
            />
            <TokenRow
              label="Output"
              value={session.output_tokens}
              color="bg-green-900/40 text-green-300"
            />
            <TokenRow
              label="Cache write"
              value={session.cache_write_tokens}
              color="bg-yellow-900/40 text-yellow-300"
            />
            <TokenRow
              label="Cache read"
              value={session.cache_read_tokens}
              color="bg-orange-900/40 text-orange-300"
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {session.message_count} messages
              </span>
              <span className="text-xs font-mono text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                {session.model}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {session.started_at
                ? new Date(session.started_at).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionList({ sessions, loading }: SessionListProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="font-semibold text-gray-200">Sessions</h2>
        </div>
        <div className="divide-y divide-gray-700/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="h-3 bg-gray-700 rounded w-3/4 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-gray-200">Sessions</h2>
        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
          {sessions.length}
        </span>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
        {sessions.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-500 text-sm">No sessions found.</div>
        ) : (
          sessions.map((session) => (
            <SessionRow key={`${session.agent}-${session.id}`} session={session} />
          ))
        )}
      </div>
    </div>
  );
}
