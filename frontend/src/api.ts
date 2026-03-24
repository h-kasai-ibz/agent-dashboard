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
