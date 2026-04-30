import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCrons,
  fetchProposals,
  fetchQueue,
  fetchTaskDetail,
  updateProposal,
  updateTask,
  type CronJob,
  type Proposal,
  type QueueTask,
  type QueueTaskDetail,
  type QueueTaskUpdate,
} from "../api";

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const URL_TEST_RE = /^https?:\/\/[^\s]+$/;

function renderWithLinks(text: string) {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, i) =>
    URL_TEST_RE.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline break-all hover:text-cyan-300">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const CATEGORY_ORDER: Proposal["category"][] = ["短期", "中期", "長期"];
const STATUS_OPTIONS: Array<Proposal["status"] | "all"> = ["all", "提案中", "採用", "却下"];
const AGENT_OPTIONS = ["all", "claude", "codex", "goose", "gemini", "any"] as const;
const TASK_STATUS_OPTIONS = ["active", "all", "pending", "in-progress", "blocked", "done"] as const;
const TASK_AGENTS = ["claude", "codex", "goose", "gemini", "any"] as const;
const PRIORITY_STYLES: Record<QueueTask["priority"], string> = {
  P1: "border-red-500/40 bg-red-500/10 text-red-200",
  P2: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  P3: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};
const PRIORITY_LABELS: Record<QueueTask["priority"], string> = {
  P1: "P1 \uD83D\uDD34",
  P2: "P2 \uD83D\uDFE1",
  P3: "P3 \uD83D\uDFE2",
};
const STATUS_BADGE_STYLES: Record<string, string> = {
  pending: "bg-slate-500/15 text-slate-200 border-slate-400/30",
  "in-progress": "bg-cyan-500/15 text-cyan-200 border-cyan-400/30",
  blocked: "bg-red-500/15 text-red-200 border-red-400/30",
  done: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
};
const AGENT_BADGE_STYLES: Record<CronJob["agent"], string> = {
  claude: "bg-orange-500/15 text-orange-300",
  codex: "bg-green-500/15 text-green-300",
  goose: "bg-purple-500/15 text-purple-300",
  gemini: "bg-blue-500/15 text-blue-300",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function TaskDetailSection({ title, body }: { title: string; body: string | null }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</h4>
      <div className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">
        {body ? renderWithLinks(body) : <span className="text-gray-500">記載なし</span>}
      </div>
    </section>
  );
}

function ProposalCard({
  item,
  onStatusChange,
  onEdit,
  onEditStart,
  onEditEnd,
}: {
  item: Proposal;
  onStatusChange: (id: string, status: Proposal["status"]) => Promise<void>;
  onEdit: (id: string, title: string, reason: string) => Promise<void>;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState(item.title);
  const [editReason, setEditReason] = React.useState(item.reason);

  async function handleStatus(status: Proposal["status"]) {
    setSaving(true);
    try { await onStatusChange(item.id, status); } finally { setSaving(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onEdit(item.id, editTitle, editReason);
      setEditing(false);
      onEditEnd();
    } finally {
      setSaving(false);
    }
  }

  function handleEditOpen() {
    setEditTitle(item.title);
    setEditReason(item.reason);
    setEditing(true);
    onEditStart();
  }

  function handleCancel() {
    setEditing(false);
    onEditEnd();
  }

  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-cyan-300">
          {item.status}
        </span>
        {!editing && (
          <button
            onClick={handleEditOpen}
            className="shrink-0 rounded-lg bg-gray-700/40 px-2 py-0.5 text-xs text-gray-400 transition hover:bg-gray-700/70"
          >
            ✎ 編集
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-100 outline-none focus:border-cyan-500 resize-none"
            placeholder="内容"
          />
          <textarea
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-400 outline-none focus:border-cyan-500 resize-none"
            placeholder="理由"
          />
          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={handleSave}
              className="rounded-lg bg-cyan-600/20 px-3 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-600/40 disabled:opacity-40"
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg bg-gray-700/40 px-3 py-1 text-xs text-gray-400 transition hover:bg-gray-700/70"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4 className="text-sm font-semibold leading-6 text-gray-100">{renderWithLinks(item.title)}</h4>
          {item.reason && (
            <p className="mt-1 text-xs leading-5 text-gray-400">{item.reason}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">{item.created}{item.source ? <> · {renderWithLinks(item.source)}</> : ""}</p>
          {item.status !== "採用" && item.status !== "却下" && (
            <div className="mt-3 flex gap-2">
              <button disabled={saving} onClick={() => handleStatus("採用")}
                className="rounded-lg bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-600/40 disabled:opacity-40">
                ✓ 採用
              </button>
              <button disabled={saving} onClick={() => handleStatus("却下")}
                className="rounded-lg bg-red-600/20 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-600/40 disabled:opacity-40">
                ✗ 却下
              </button>
            </div>
          )}
          {(item.status === "採用" || item.status === "却下") && (
            <div className="mt-3">
              <button disabled={saving} onClick={() => handleStatus("提案中")}
                className="rounded-lg bg-gray-700/40 px-3 py-1 text-xs font-medium text-gray-400 transition hover:bg-gray-700/70 disabled:opacity-40">
                ↩ 提案中に戻す
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ProposalColumn({
  title,
  items,
  onStatusChange,
  onEdit,
  onEditStart,
  onEditEnd,
}: {
  title: Proposal["category"];
  items: Proposal[];
  onStatusChange: (id: string, status: Proposal["status"]) => Promise<void>;
  onEdit: (id: string, title: string, reason: string) => Promise<void>;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-500">No proposals.</div>
      ) : (
        items.map((item) => (
          <ProposalCard key={item.id} item={item} onStatusChange={onStatusChange} onEdit={onEdit} onEditStart={onEditStart} onEditEnd={onEditEnd} />
        ))
      )}
    </section>
  );
}

function QueueCard({
  task,
  onUpdate,
  saving,
  onOpen,
  selected,
}: {
  task: QueueTask;
  onUpdate: (taskId: string, updates: QueueTaskUpdate) => Promise<void>;
  saving: boolean;
  onOpen: (taskId: string) => void;
  selected: boolean;
}) {
  const selectedAgent = TASK_AGENTS.includes(task.agent as (typeof TASK_AGENTS)[number])
    ? (task.agent as (typeof TASK_AGENTS)[number])
    : "any";

  return (
    <article
      onClick={() => onOpen(task.id)}
      className={`rounded-xl border p-4 transition ${PRIORITY_STYLES[task.priority]} ${
        selected ? "ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-gray-950" : "hover:border-cyan-500/40"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono text-gray-300">{task.id}</p>
          <button
            type="button"
            onClick={() => onOpen(task.id)}
            className="mt-1 text-left text-sm font-semibold text-white transition hover:text-cyan-200"
          >
            {task.title}
          </button>
        </div>
        <span className="rounded-full bg-gray-950/40 px-2 py-1 text-xs font-semibold">
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
        <div>
          <p className="text-gray-500">Status</p>
          <p className="mt-1">{task.status}</p>
        </div>
        <div>
          <p className="text-gray-500">Deadline</p>
          <p className="mt-1">{task.deadline ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Created</p>
          <p className="mt-1">{formatDate(task.created)}</p>
        </div>
        <div>
          <p className="text-gray-500">Agent</p>
          <p className="mt-1">{task.agent}</p>
        </div>
      </div>
      {task.background && (
        <div className="mt-3 rounded-lg border border-gray-700/50 bg-gray-950/40 px-3 py-2">
          <p className="text-xs text-gray-500 mb-1">背景</p>
          <p className="text-xs leading-5 text-gray-300">{task.background}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-400">
          Priority
          <select
            value={task.priority}
            disabled={saving}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdate(task.id, { priority: event.target.value as QueueTask["priority"] })
            }
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-cyan-500"
          >
            {(["P1", "P2", "P3"] as const).map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          Agent
          <select
            value={selectedAgent}
            disabled={saving}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdate(task.id, { agent: event.target.value as (typeof TASK_AGENTS)[number] })
            }
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-cyan-500"
          >
            {TASK_AGENTS.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

export default function BacklogPage({ refreshToken }: { refreshToken: number }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("提案中");
  const [agentFilter, setAgentFilter] = useState<(typeof AGENT_OPTIONS)[number]>("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState<(typeof TASK_STATUS_OPTIONS)[number]>("active");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<QueueTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCount, setEditingCount] = useState(0);
  const pendingRefresh = useRef(false);

  const handleEditStart = useCallback(() => setEditingCount((n) => n + 1), []);
  const handleEditEnd = useCallback(() => setEditingCount((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [proposalItems, queueItems, cronItems] = await Promise.all([
          fetchProposals(),
          fetchQueue(),
          fetchCrons(),
        ]);
        if (!cancelled) {
          setProposals(proposalItems);
          setTasks(queueItems);
          setCrons(cronItems);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load backlog");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (editingCount > 0) {
      pendingRefresh.current = true;
      return;
    }
    pendingRefresh.current = false;
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, editingCount]);

  // 編集完了後に保留リフレッシュを実行
  useEffect(() => {
    if (editingCount === 0 && pendingRefresh.current) {
      pendingRefresh.current = false;
      // 非同期でリフレッシュ（直接 load を呼ぶのと同等）
      const run = async () => {
        setLoading(true);
        setError(null);
        try {
          const [proposalItems, queueItems, cronItems] = await Promise.all([
            fetchProposals(),
            fetchQueue(),
            fetchCrons(),
          ]);
          setProposals(proposalItems);
          setTasks(queueItems);
          setCrons(cronItems);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load backlog");
        } finally {
          setLoading(false);
        }
      };
      run();
    }
  }, [editingCount]);

  const groupedProposals = useMemo(() => {
    const filtered = proposals.filter((item) => statusFilter === "all" || item.status === statusFilter);
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    }));
  }, [proposals, statusFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (agentFilter !== "all" && task.agent !== agentFilter) return false;
      if (taskStatusFilter === "active") return task.status !== "done";
      if (taskStatusFilter === "all") return true;
      return task.status === taskStatusFilter;
    });
  }, [tasks, agentFilter, taskStatusFilter]);

  async function handleProposalStatusChange(proposalId: string, status: Proposal["status"]) {
    setError(null);
    try {
      const updated = await updateProposal(proposalId, { status });
      setProposals((current) => current.map((p) => (p.id === proposalId ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update proposal");
    }
  }

  async function handleProposalEdit(proposalId: string, title: string, reason: string) {
    setError(null);
    try {
      const updated = await updateProposal(proposalId, { title, reason });
      setProposals((current) => current.map((p) => (p.id === proposalId ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to edit proposal");
    }
  }

  async function handleTaskUpdate(taskId: string, updates: QueueTaskUpdate) {
    setSavingTaskId(taskId);
    setError(null);
    try {
      const updated = await updateTask(taskId, updates);
      setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      setSelectedTaskDetail((current) => (current && current.id === taskId ? { ...current, ...updated } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setSavingTaskId(null);
    }
  }

  async function handleTaskOpen(taskId: string) {
    setSelectedTaskId(taskId);
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await fetchTaskDetail(taskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      setSelectedTaskDetail(null);
      setError(err instanceof Error ? err.message : "Failed to fetch task detail");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleTaskClose() {
    setSelectedTaskId(null);
    setSelectedTaskDetail(null);
    setDetailLoading(false);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Proposals</h2>
            <p className="text-sm text-gray-500">短期 / 中期 / 長期で整理</p>
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as (typeof STATUS_OPTIONS)[number])}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-cyan-500"
          >
            <option value="all">All status</option>
            {STATUS_OPTIONS.filter((value) => value !== "all").map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {CATEGORY_ORDER.map((category) => (
              <div key={category} className="h-56 animate-pulse rounded-xl bg-gray-800" />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {groupedProposals.map((group) => (
              <ProposalColumn key={group.category} title={group.category} items={group.items} onStatusChange={handleProposalStatusChange} onEdit={handleProposalEdit} onEditStart={handleEditStart} onEditEnd={handleEditEnd} />
            ))}
          </div>
        )}
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Task Queue</h2>
              <p className="text-sm text-gray-500">優先度色分け + フィルタ</p>
            </div>
            <div className="flex gap-2">
              <select
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value as (typeof TASK_STATUS_OPTIONS)[number])}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-cyan-500"
              >
                <option value="active">Active (done除く)</option>
                <option value="all">All status</option>
                <option value="pending">pending</option>
                <option value="in-progress">in-progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
              <select
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value as (typeof AGENT_OPTIONS)[number])}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-cyan-500"
              >
                {AGENT_OPTIONS.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent === "all" ? "All agents" : agent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-xl bg-gray-800" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-500">
              No tasks in queue.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTasks.map((task) => (
                <QueueCard
                  key={task.id}
                  task={task}
                  saving={savingTaskId === task.id}
                  onUpdate={handleTaskUpdate}
                  onOpen={handleTaskOpen}
                  selected={selectedTaskId === task.id}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 p-5">
          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">定期実行タスク</p>
          </div>

          {loading ? (
            <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
          ) : crons.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-500">
              No cron jobs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-3 pr-4 font-medium">ラベル</th>
                    <th className="pb-3 pr-4 font-medium">スケジュール</th>
                    <th className="pb-3 pr-4 font-medium">担当エージェント</th>
                    <th className="pb-3 font-medium">最終実行</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/80">
                  {crons.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-100">{job.label}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{job.command}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="text-gray-200">{job.schedule_human}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{job.schedule}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            AGENT_BADGE_STYLES[job.agent]
                          }`}
                        >
                          {job.agent}
                        </span>
                      </td>
                      <td className="py-3 text-gray-300">{formatDate(job.last_run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      </div>

      {selectedTaskId && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close task detail"
            className="absolute inset-0 cursor-default"
            onClick={handleTaskClose}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-gray-800 bg-gray-900 shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-gray-500">{selectedTaskId}</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    {selectedTaskDetail?.title ?? "Loading task detail"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    TASK Markdown をインライン表示
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTaskClose}
                  className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-600 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {detailLoading ? (
                <>
                  <div className="h-24 animate-pulse rounded-xl bg-gray-800" />
                  <div className="h-40 animate-pulse rounded-xl bg-gray-800" />
                  <div className="h-40 animate-pulse rounded-xl bg-gray-800" />
                </>
              ) : selectedTaskDetail ? (
                <>
                  <section className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[selectedTaskDetail.status] ?? "border-gray-700 bg-gray-800 text-gray-200"}`}>
                        {selectedTaskDetail.status}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${PRIORITY_STYLES[selectedTaskDetail.priority]}`}>
                        {selectedTaskDetail.priority}
                      </span>
                      <span className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-200">
                        {selectedTaskDetail.agent}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-gray-300 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Created</p>
                        <p className="mt-1">{formatDate(selectedTaskDetail.created)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Deadline</p>
                        <p className="mt-1">{selectedTaskDetail.deadline ?? "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-gray-500">File</p>
                        <p className="mt-1 break-all font-mono text-xs text-gray-400">{selectedTaskDetail.file_path}</p>
                      </div>
                    </div>
                  </section>

                  <TaskDetailSection title="説明" body={selectedTaskDetail.description} />
                  <TaskDetailSection title="背景" body={selectedTaskDetail.background} />
                  <TaskDetailSection title="期待成果物" body={selectedTaskDetail.expected_deliverables} />
                  <TaskDetailSection title="成功基準" body={selectedTaskDetail.success_criteria} />
                  <TaskDetailSection title="実行プラン" body={selectedTaskDetail.execution_plan} />
                  <TaskDetailSection title="進捗ログ" body={selectedTaskDetail.progress_log} />
                  <TaskDetailSection title="成果物" body={selectedTaskDetail.deliverables} />
                  <TaskDetailSection title="次アクション" body={selectedTaskDetail.next_actions} />
                  <TaskDetailSection title="振り返り" body={selectedTaskDetail.retrospective} />
                  <TaskDetailSection title="ブロッカー" body={selectedTaskDetail.blockers} />
                </>
              ) : (
                <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-200">
                  タスク詳細を取得できませんでした。
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
