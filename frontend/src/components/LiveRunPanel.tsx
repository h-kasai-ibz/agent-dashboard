import React, { useEffect, useMemo, useState } from "react";
import { Play, Square, Terminal, WandSparkles } from "lucide-react";
import {
  connectLiveRun,
  createLiveRun,
  fetchLiveRun,
  listLiveRuns,
  stopLiveRun,
  type LiveEvent,
  type LiveRunSummary,
} from "../api";

const COMMAND_PRESETS = [
  {
    label: "Claude JSON",
    command: 'claude -p --output-format json "Summarize this repository in 3 bullets."',
  },
  {
    label: "Codex JSON",
    command: 'codex exec --json "Explain the current directory."',
  },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusTone(status: LiveRunSummary["status"]): string {
  switch (status) {
    case "running":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30";
    case "completed":
      return "bg-cyan-500/15 text-cyan-300 border-cyan-400/30";
    case "failed":
      return "bg-red-500/15 text-red-300 border-red-400/30";
    case "starting":
      return "bg-amber-500/15 text-amber-300 border-amber-400/30";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-400/30";
  }
}

function eventTone(event: LiveEvent): string {
  if (event.kind === "error") return "border-red-500/40 bg-red-950/40";
  if (event.stream === "stderr") return "border-amber-500/30 bg-amber-950/20";
  if (event.format === "json") return "border-cyan-500/30 bg-cyan-950/20";
  return "border-gray-800 bg-gray-950/60";
}

export default function LiveRunPanel() {
  const [runs, setRuns] = useState<LiveRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<LiveRunSummary | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [command, setCommand] = useState(COMMAND_PRESETS[0].command);
  const [cwd, setCwd] = useState("/home/kasai");
  const [label, setLabel] = useState("Claude JSON");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshRuns(preferredRunId?: string | null) {
    setLoadingRuns(true);
    try {
      const nextRuns = await listLiveRuns();
      setRuns(nextRuns);
      const targetId = preferredRunId ?? selectedRunId ?? nextRuns[0]?.id ?? null;
      setSelectedRunId(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live runs");
    } finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    refreshRuns();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      setEvents([]);
      setSelectedSeq(null);
      return;
    }

    let cancelled = false;
    setError(null);

    fetchLiveRun(selectedRunId)
      .then((payload) => {
        if (cancelled) return;
        setSelectedRun(payload.run);
        setEvents(payload.events);
        setSelectedSeq(payload.events[payload.events.length - 1]?.seq ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch run");
        }
      });

    const disconnect = connectLiveRun(selectedRunId, {
      onMessage: (event) => {
        if (event.kind === "snapshot" && "run" in event) {
          setSelectedRun((event as { run: LiveRunSummary }).run);
          return;
        }
        setEvents((current) => {
          if (event.seq && current.some((item) => item.seq === event.seq)) {
            return current;
          }
          const next = [...current, event].slice(-300);
          return next;
        });
        setSelectedSeq((current) => current ?? event.seq ?? null);
        if (event.kind === "status") {
          setSelectedRun((current) =>
            current
              ? {
                  ...current,
                  status: (event.status as LiveRunSummary["status"]) ?? current.status,
                  return_code: event.return_code ?? current.return_code,
                }
              : current,
          );
          refreshRuns(selectedRunId);
        }
      },
      onError: () => {
        setError("Live WebSocket connection failed");
      },
    });

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [selectedRunId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.seq === selectedSeq) ?? events[events.length - 1] ?? null,
    [events, selectedSeq],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const run = await createLiveRun({
        command,
        cwd: cwd || undefined,
        label: label || undefined,
      });
      await refreshRuns(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!selectedRunId) return;
    try {
      await stopLiveRun(selectedRunId);
      await refreshRuns(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop run");
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <div className="space-y-4">
        <section className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300">
              <Terminal size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Launch Live Run</h2>
              <p className="text-xs text-gray-500">Run a local JSON-capable CLI and stream its output.</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-xs text-gray-400">
              Label
              <input
                className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-cyan-500"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Claude JSON"
              />
            </label>

            <label className="block text-xs text-gray-400">
              Working directory
              <input
                className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-cyan-500"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/home/kasai"
              />
            </label>

            <label className="block text-xs text-gray-400">
              Command
              <textarea
                className="mt-1 min-h-28 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 font-mono text-sm text-gray-100 outline-none focus:border-cyan-500"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder='claude -p --output-format json "Hello"'
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {COMMAND_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setLabel(preset.label);
                    setCommand(preset.command);
                  }}
                  className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-300 transition hover:border-cyan-500 hover:text-cyan-300"
                >
                  <span className="inline-flex items-center gap-1">
                    <WandSparkles size={12} />
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-cyan-400 disabled:opacity-50"
            >
              <Play size={15} />
              {submitting ? "Starting..." : "Start run"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/80">
          <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Recent Runs</h2>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{runs.length}</span>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loadingRuns ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-800" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <div className="p-5 text-sm text-gray-500">No live runs yet.</div>
            ) : (
              runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`block w-full border-b border-gray-800 px-5 py-4 text-left transition hover:bg-gray-950/60 ${
                    selectedRunId === run.id ? "bg-gray-950/80" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-100">{run.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <p className="truncate font-mono text-xs text-gray-400">{run.command.join(" ")}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>{run.event_count} events</span>
                    <span>{formatDate(run.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedRun?.label ?? "Live run"}</h2>
              <p className="mt-1 font-mono text-xs text-gray-400">
                {selectedRun ? selectedRun.command.join(" ") : "Select a run to inspect events."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedRun && (
                <span className={`rounded-full border px-2 py-1 text-xs ${statusTone(selectedRun.status)}`}>
                  {selectedRun.status}
                </span>
              )}
              {selectedRun?.status === "running" && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                >
                  <Square size={12} />
                  Stop
                </button>
              )}
            </div>
          </div>

          {selectedRun ? (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl bg-gray-950/80 p-3">
                <p className="text-xs text-gray-500">Working dir</p>
                <p className="mt-1 break-all text-sm text-gray-100">{selectedRun.cwd}</p>
              </div>
              <div className="rounded-xl bg-gray-950/80 p-3">
                <p className="text-xs text-gray-500">PID</p>
                <p className="mt-1 text-sm text-gray-100">{selectedRun.pid ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-gray-950/80 p-3">
                <p className="text-xs text-gray-500">Started</p>
                <p className="mt-1 text-sm text-gray-100">{formatDate(selectedRun.started_at ?? selectedRun.created_at)}</p>
              </div>
              <div className="rounded-xl bg-gray-950/80 p-3">
                <p className="text-xs text-gray-500">Return code</p>
                <p className="mt-1 text-sm text-gray-100">{selectedRun.return_code ?? "—"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Start a run from the left panel or pick an existing one.</p>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="rounded-2xl border border-gray-800 bg-gray-900/80">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Event Stream</h2>
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{events.length}</span>
            </div>

            <div className="max-h-[620px] overflow-y-auto px-4 py-4">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                  No events yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <button
                      key={`${event.seq ?? "snapshot"}-${event.timestamp ?? ""}`}
                      type="button"
                      onClick={() => setSelectedSeq(event.seq ?? null)}
                      className={`block w-full rounded-xl border px-4 py-3 text-left transition hover:border-cyan-500/40 ${eventTone(event)} ${
                        selectedSeq === event.seq ? "ring-1 ring-cyan-500/50" : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-300">{event.kind}</span>
                          {event.stream && (
                            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">{event.stream}</span>
                          )}
                          {event.format && (
                            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-cyan-300">{event.format}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {event.seq ? `#${event.seq}` : formatDate(event.timestamp ?? null)}
                        </span>
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap break-words font-mono text-xs text-gray-200">
                        {event.text ?? event.message ?? JSON.stringify(event.json ?? event, null, 2)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900/80">
            <div className="border-b border-gray-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Selected Event</h2>
            </div>
            <div className="max-h-[620px] overflow-y-auto p-5">
              {selectedEvent ? (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950/80 p-4 text-xs text-gray-200">
                  {JSON.stringify(selectedEvent, null, 2)}
                </pre>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                  Select an event to inspect structured JSON.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
