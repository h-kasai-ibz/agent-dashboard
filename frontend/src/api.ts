export interface Agent {
  id: string;
  name: string;
  status: "active" | "idle";
  model: string;
  sessions_count: number;
  total_cost_usd: number;
  last_active: string | null;
  color?: string;
}

export interface Session {
  id: string;
  agent: string;
  project: string;
  started_at: string | null;
  last_active: string | null;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  first_message: string;
  model: string;
}

export interface AgentStats {
  agent: string;
  sessions_count: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
}

export interface Stats {
  total_cost_usd: number;
  total_sessions: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_write_tokens: number;
  total_cache_read_tokens: number;
  by_agent: AgentStats[];
}

export interface LiveRunSummary {
  id: string;
  label: string;
  command: string[];
  cwd: string;
  status: "queued" | "starting" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  return_code: number | null;
  pid: number | null;
  error: string | null;
  event_count: number;
}

export interface LiveEvent {
  seq?: number;
  run_id?: string;
  timestamp?: string;
  kind: string;
  stream?: "stdout" | "stderr";
  text?: string;
  json?: unknown;
  format?: "json" | "text";
  status?: string;
  return_code?: number;
  message?: string;
  command?: string[];
  cwd?: string;
  pid?: number;
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  return res.json();
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function listLiveRuns(): Promise<LiveRunSummary[]> {
  const res = await fetch("/api/live/runs");
  if (!res.ok) throw new Error(`Failed to fetch live runs: ${res.status}`);
  const data = await res.json();
  return data.runs;
}

export async function createLiveRun(payload: {
  command: string;
  cwd?: string;
  label?: string;
}): Promise<LiveRunSummary> {
  const res = await fetch("/api/live/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create live run: ${res.status}`);
  const data = await res.json();
  return data.run;
}

export async function fetchLiveRun(runId: string): Promise<{ run: LiveRunSummary; events: LiveEvent[] }> {
  const res = await fetch(`/api/live/runs/${runId}`);
  if (!res.ok) throw new Error(`Failed to fetch live run: ${res.status}`);
  return res.json();
}

export async function stopLiveRun(runId: string): Promise<LiveRunSummary> {
  const res = await fetch(`/api/live/runs/${runId}/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to stop live run: ${res.status}`);
  const data = await res.json();
  return data.run;
}

/**
 * Subscribe to SSE /api/events. Calls onUpdate whenever an "update" event
 * arrives. Returns a cleanup function that closes the EventSource.
 */
export function subscribeToEvents(onUpdate: () => void): () => void {
  const es = new EventSource("/api/events");

  es.addEventListener("update", () => {
    onUpdate();
  });

  es.onerror = () => {
    // Reconnect automatically handled by EventSource; no action needed.
  };

  return () => {
    es.close();
  };
}

export function connectLiveRun(
  runId: string,
  handlers: {
    onMessage: (event: LiveEvent) => void;
    onClose?: () => void;
    onError?: () => void;
  },
): () => void {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${window.location.host}/ws/live/runs/${runId}`);

  ws.onmessage = (message) => {
    handlers.onMessage(JSON.parse(message.data) as LiveEvent);
  };
  ws.onclose = () => {
    handlers.onClose?.();
  };
  ws.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    ws.close();
  };
}
