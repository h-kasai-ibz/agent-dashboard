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

export interface CronJob {
  id: string;
  label: string;
  command: string;
  schedule: string;
  schedule_human: string;
  agent: "claude" | "codex" | "goose" | "gemini";
  last_run: string | null;
}

export interface Proposal {
  id: string;
  title: string;
  reason: string;
  status: "提案中" | "採用" | "却下";
  category: "短期" | "中期" | "長期";
  created: string;
  source?: string | null;
}

export interface QueueTask {
  id: string;
  title: string;
  status: "pending" | "in-progress" | "blocked" | "done";
  priority: "P1" | "P2" | "P3";
  deadline: string | null;
  created: string;
  agent: "claude" | "codex" | "goose" | "gemini" | "any";
  background: string | null;
}

export interface QueueTaskDetail extends QueueTask {
  file_path: string | null;
  description: string | null;
  expected_deliverables: string | null;
  success_criteria: string | null;
  execution_plan: string | null;
  progress_log: string | null;
  deliverables: string | null;
  next_actions: string | null;
  retrospective: string | null;
  blockers: string | null;
}

export interface QueueTaskUpdate {
  priority?: QueueTask["priority"];
  agent?: QueueTask["agent"];
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

export async function fetchCrons(): Promise<CronJob[]> {
  const res = await fetch("/api/crons");
  if (!res.ok) throw new Error(`Failed to fetch crons: ${res.status}`);
  return res.json();
}

export async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch("/api/proposals");
  if (!res.ok) throw new Error(`Failed to fetch proposals: ${res.status}`);
  return res.json();
}

export async function fetchQueue(): Promise<QueueTask[]> {
  const res = await fetch("/api/tasks/queue");
  if (!res.ok) throw new Error(`Failed to fetch queue: ${res.status}`);
  return res.json();
}

export async function fetchTaskDetail(id: string): Promise<QueueTaskDetail | null> {
  const res = await fetch(`/api/tasks/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch task detail: ${res.status}`);
  return res.json();
}

export async function updateProposal(id: string, data: any): Promise<Proposal> {
  return {
    id,
    title: data?.title ?? "",
    reason: data?.reason ?? "",
    status: data?.status ?? "提案中",
    category: data?.category ?? "短期",
    created: "",
    source: null,
  };
}

export async function updateTask(id: string, data: any): Promise<QueueTask> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
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
