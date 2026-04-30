import React, { useCallback, useEffect, useState } from "react";
import { Activity, Eye, RefreshCw, Radio } from "lucide-react";
import {
  fetchAgents,
  fetchSessions,
  fetchStats,
  subscribeToEvents,
  type Agent,
  type Session,
  type Stats,
} from "./api";
import AgentCard from "./components/AgentCard";
import LiveRunPanel from "./components/LiveRunPanel";
import SessionList from "./components/SessionList";
import StatsBar from "./components/StatsBar";
import BacklogPage from "./pages/BacklogPage";

type ViewMode = "overview" | "backlog" | "live";

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>("overview");

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [agentsData, sessionsData, statsData] = await Promise.all([
        fetchAgents(),
        fetchSessions(),
        fetchStats(),
      ]);
      setAgents(agentsData);
      setSessions(sessionsData);
      setStats(statsData);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // SSE subscription for live refresh
  useEffect(() => {
    const cleanup = subscribeToEvents(() => {
      loadData(true);
    });
    return cleanup;
  }, [loadData]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <Activity size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Agent Dashboard</h1>
              <p className="text-xs text-gray-500">History view + live CLI event stream</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg text-gray-300"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setView("overview")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              view === "overview"
                ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                : "border-gray-700 bg-gray-800/80 text-gray-400 hover:text-gray-200"
            }`}
          >
            <Eye size={15} />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setView("backlog")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              view === "backlog"
                ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                : "border-gray-700 bg-gray-800/80 text-gray-400 hover:text-gray-200"
            }`}
          >
            <Activity size={15} />
            BackLog
          </button>
          <button
            type="button"
            onClick={() => setView("live")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              view === "live"
                ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                : "border-gray-700 bg-gray-800/80 text-gray-400 hover:text-gray-200"
            }`}
          >
            <Radio size={15} />
            Live Run
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {view === "live" ? (
          <LiveRunPanel />
        ) : view === "backlog" ? (
          <BacklogPage refreshToken={lastRefresh.getTime()} />
        ) : (
          <>
            <StatsBar stats={stats} loading={loading} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Agents
                </h2>
                {loading ? (
                  <>
                    <div className="bg-gray-800 rounded-xl h-44 animate-pulse" />
                    <div className="bg-gray-800 rounded-xl h-44 animate-pulse" />
                  </>
                ) : agents.length === 0 ? (
                  <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
                    No agents found.
                  </div>
                ) : (
                  agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
                )}
              </div>

              <div className="lg:col-span-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Recent Sessions
                </h2>
                <SessionList sessions={sessions} loading={loading} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
