"""FastAPI backend for the AI Agent Activity Dashboard."""
from __future__ import annotations

import asyncio
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))

from live_runner import LiveRunManager  # noqa: E402
from parsers import claude_code, goose, grok  # noqa: E402
from parsers import codex, gemini_cli   # noqa: E402
from process_monitor import get_running_agents  # noqa: E402

app = FastAPI(title="Agent Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AGENTS: dict[str, dict] = {
    "claude-code-kasai": {
        "id": "claude-code-kasai",
        "name": "Claude Code (kasai)",
        "model": "claude-sonnet-4-6",
        "color": "orange",
    },
    "claude-code-clawadmin": {
        "id": "claude-code-clawadmin",
        "name": "Claude Code (clawadmin)",
        "model": "claude-sonnet-4-6",
        "color": "amber",
    },
    "claude-code-clawuser": {
        "id": "claude-code-clawuser",
        "name": "Claude Code (clawuser)",
        "model": "claude-sonnet-4-6",
        "color": "yellow",
    },
    "codex-kasai": {
        "id": "codex-kasai",
        "name": "Codex (kasai)",
        "model": "gpt-5.4",
        "color": "green",
    },
    "codex-clawadmin": {
        "id": "codex-clawadmin",
        "name": "Codex (clawadmin)",
        "model": "gpt-5.4",
        "color": "teal",
    },
    "gemini": {
        "id": "gemini",
        "name": "Gemini CLI",
        "model": "gemini-2.5-flash",
        "color": "blue",
    },
    "kimi": {
        "id": "kimi",
        "name": "Kimi (Moonshot AI)",
        "model": "kimi-k2-instruct",
        "color": "cyan",
    },
    "grok": {
        "id": "grok",
        "name": "Grok (xAI)",
        "model": "grok-3-mini",
        "color": "orange",
    },
    "goose": {
        "id": "goose",
        "name": "Goose",
        "model": "gemini-2.5-flash",
        "color": "purple",
    },
}

AGENT_REGISTRY = AGENTS
LIVE_RUN_MANAGER = LiveRunManager()
TASKS_DIR = Path("/home/kasai/agent-shared/tasks")
DONE_TASKS_DIR = TASKS_DIR / "done"
PROPOSALS_FILE = Path("/home/kasai/agent-shared/PROPOSALS.md")


class LiveRunCreateRequest(BaseModel):
    command: str
    cwd: str | None = None
    label: str | None = None


class TaskPatchRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    agent: str | None = None
    memo: str | None = None


def _is_recently_active(last_active_str: str | None, minutes: int = 5) -> bool:
    if not last_active_str:
        return False
    try:
        ts = datetime.fromisoformat(last_active_str.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds() < minutes * 60
    except ValueError:
        return False


def _get_all_sessions() -> list[dict]:
    sessions: list[dict] = []
    sessions.extend(claude_code.get_all_sessions())
    sessions.extend(codex.get_all_sessions())
    sessions.extend(gemini_cli.get_all_sessions())
    sessions.extend(grok.get_all_sessions())
    sessions.extend(goose.get_all_sessions())
    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions


def _normalize_agent(value: str | None) -> str:
    if not value:
        return "any"
    lowered = value.strip().lower()
    if lowered in {"null", "none", "unknown", "-", ""}:
        return "any"
    if lowered in {"claude", "codex", "goose", "gemini", "any"}:
        return lowered
    return "any"


def _extract_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text

    match = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if not match:
        return {}, text

    frontmatter: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key_match = re.match(r'^([A-Za-z0-9_-]+):\s*(.*)$', line)
        if not key_match:
            continue
        key = key_match.group(1).strip()
        value = key_match.group(2).strip().strip('"').strip("'")
        frontmatter[key] = value

    return frontmatter, text[match.end():]


def _extract_section(text: str, heading: str) -> str | None:
    pattern = rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)"
    match = re.search(pattern, text, re.M | re.S)
    if not match:
        return None
    return match.group(1).strip() or None


def _replace_first(pattern: str, replacement: str, text: str) -> tuple[str, bool]:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.M)
    return updated, count > 0


def _parse_task_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    frontmatter, body = _extract_frontmatter(text)

    title_match = re.search(r"^#\s+TASK-[^:]+:\s+(.*)$", body, re.M)
    title = frontmatter.get("title") or (title_match.group(1).strip() if title_match else path.stem)

    status_match = re.search(r"^\*\*状態\*\*:\s*(.+)$", body, re.M)
    priority_match = re.search(r"^\*\*優先度\*\*:\s*(.+)$", body, re.M)
    agent_match = re.search(r"^\*\*担当エージェント\*\*:\s*(.*)$", body, re.M)
    if not agent_match:
        agent_match = re.search(r"^\*\*担当\*\*:\s*(.*)$", body, re.M)

    created_match = re.search(r"^\*\*作成\*\*:\s*(.+)$", body, re.M)
    deadline_match = re.search(r"^## 期限\n(.*?)(?=^## |\Z)", body, re.M | re.S)

    status = (frontmatter.get("status") or (status_match.group(1).strip() if status_match else "")).strip() or ("done" if path.parent == DONE_TASKS_DIR else "pending")
    priority = (frontmatter.get("priority") or (priority_match.group(1).strip() if priority_match else "P3")).strip()
    agent = _normalize_agent(frontmatter.get("owner") or (agent_match.group(1).strip() if agent_match else None))
    created = (frontmatter.get("created") or (created_match.group(1).strip() if created_match else "")).strip()
    stat = path.stat()
    updated = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
    background = _extract_section(body, "背景")

    return {
        "id": path.stem,
        "title": title,
        "status": status,
        "priority": priority if priority in {"P1", "P2", "P3"} else "P3",
        "deadline": deadline_match.group(1).strip() if deadline_match else None,
        "created": created or datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
        "updated": updated,
        "agent": agent,
        "background": background,
        "file_path": str(path),
        "description": _extract_section(body, "説明"),
        "expected_deliverables": _extract_section(body, "期待成果物の形式"),
        "success_criteria": _extract_section(body, "成功基準") or _extract_section(body, "Criteria for Success（成功基準）"),
        "execution_plan": _extract_section(body, "実行プラン"),
        "progress_log": _extract_section(body, "進捗ログ"),
        "deliverables": _extract_section(body, "成果物"),
        "next_actions": _extract_section(body, "次アクション"),
        "retrospective": _extract_section(body, "振り返り"),
        "blockers": _extract_section(body, "ブロッカー"),
    }


def _find_task_path(task_id: str) -> Path | None:
    normalized = task_id if task_id.startswith("TASK-") else f"TASK-{task_id}"
    for candidate in (TASKS_DIR / f"{normalized}.md", DONE_TASKS_DIR / f"{normalized}.md"):
        if candidate.exists():
            return candidate
    return None


def _update_frontmatter_value(text: str, key: str, value: str) -> str:
    if not text.startswith("---\n"):
        return text
    pattern = rf"^({re.escape(key)}:\s*).*$"
    updated, replaced = _replace_first(pattern, rf"\1{value}", text)
    if replaced:
        return updated
    return re.sub(r"^---\n", f"---\n{key}: {value}\n", text, count=1)


def _sync_task_metadata(path: Path, *, status: str | None = None, priority: str | None = None, agent: str | None = None) -> Path:
    text = path.read_text(encoding="utf-8")
    if status:
        text = _update_frontmatter_value(text, "status", status)
        text, replaced = _replace_first(r"^(\*\*状態\*\*:\s*).*$", rf"\1{status}", text)
        if not replaced and not text.startswith("---\n"):
            text = re.sub(r"^(# .+\n)", rf"\1\n**状態**: {status}\n", text, count=1, flags=re.M)
    if priority:
        text = _update_frontmatter_value(text, "priority", priority)
        text, replaced = _replace_first(r"^(\*\*優先度\*\*:\s*).*$", rf"\1{priority}", text)
        if not replaced and not text.startswith("---\n"):
            text = re.sub(r"^(\*\*状態\*\*:.+\n)", rf"\1**優先度**: {priority}\n", text, count=1, flags=re.M)
    if agent:
        text = _update_frontmatter_value(text, "owner", agent)
        text, replaced = _replace_first(r"^(\*\*担当エージェント\*\*:\s*).*$", rf"\1{agent}", text)
        if not replaced:
            text, replaced = _replace_first(r"^(\*\*担当\*\*:\s*).*$", rf"\1{agent}", text)
        if not replaced and not text.startswith("---\n"):
            text = re.sub(r"^(\*\*優先度\*\*:.+\n)", rf"\1**担当エージェント**: {agent}\n", text, count=1, flags=re.M)
    path.write_text(text, encoding="utf-8")
    return path


def _run_task_update(task_id: str, status: str, memo: str | None) -> None:
    command = ["/home/kasai/scripts/task-update.sh", task_id, status]
    if memo:
        command.append(memo)
    subprocess.run(command, check=True, capture_output=True, text=True)


def _apply_task_patch(task_id: str, payload: TaskPatchRequest) -> dict:
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Task not found")

    normalized_task_id = path.stem
    requested_status = payload.status.strip() if payload.status else None
    if requested_status and requested_status not in {"pending", "in-progress", "blocked", "done"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    if payload.priority and payload.priority not in {"P1", "P2", "P3"}:
        raise HTTPException(status_code=400, detail="Invalid priority")

    if requested_status == "blocked" and not payload.memo:
        raise HTTPException(status_code=400, detail="Blocked status requires memo")

    if requested_status:
        try:
            _run_task_update(normalized_task_id, requested_status, payload.memo)
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr.strip() or exc.stdout.strip() or "task-update.sh failed"
            raise HTTPException(status_code=500, detail=detail) from exc

        path = _find_task_path(normalized_task_id)
        if path is None:
            raise HTTPException(status_code=500, detail="Task file missing after update")

        if requested_status != "done" and path.parent == DONE_TASKS_DIR:
            target = TASKS_DIR / path.name
            path.replace(target)
            path = target

        path = _sync_task_metadata(path, status=requested_status)

    if payload.priority or payload.agent:
        path = _find_task_path(normalized_task_id) or path
        path = _sync_task_metadata(
            path,
            priority=payload.priority,
            agent=_normalize_agent(payload.agent) if payload.agent else None,
        )

    final_path = _find_task_path(normalized_task_id)
    if final_path is None:
        raise HTTPException(status_code=500, detail="Task file not found after patch")
    return _parse_task_file(final_path)


def _parse_proposals() -> list[dict]:
    if not PROPOSALS_FILE.exists():
        return []

    text = PROPOSALS_FILE.read_text(encoding="utf-8")
    pattern = re.compile(r"^### \[(?P<date>\d{4}-\d{2}-\d{2}[^\]]*)\] (?P<source>.+?)\n(?P<body>.*?)(?=^### |\Z)", re.M | re.S)
    items: list[dict] = []
    for index, match in enumerate(pattern.finditer(text), start=1):
        body = match.group("body")
        category_match = re.search(r"^\*\*カテゴリ\*\*:\s*(.+)$", body, re.M)
        title_match = re.search(r"^\*\*内容\*\*:\s*(.+)$", body, re.M)
        reason_match = re.search(r"^\*\*理由\*\*:\s*(.+)$", body, re.M)
        status_match = re.search(r"^\*\*ステータス\*\*:\s*(.+)$", body, re.M)
        items.append(
            {
                "id": f"proposal-{index:03d}",
                "title": (title_match.group(1).strip() if title_match else match.group("source").strip()),
                "reason": reason_match.group(1).strip() if reason_match else "",
                "status": status_match.group(1).strip() if status_match else "提案中",
                "category": category_match.group(1).strip() if category_match else "短期",
                "created": match.group("date").strip(),
                "source": match.group("source").strip(),
            }
        )
    return items


def _humanize_cron(schedule: str) -> str:
    if schedule == "@reboot":
        return "on reboot"
    if schedule == "0 */6 * * *":
        return "every 6 hours"
    if schedule == "0 0 * * *":
        return "daily at 00:00"
    return schedule


def _infer_agent_from_command(command: str) -> str:
    lowered = command.lower()
    for agent in ("codex", "goose", "gemini", "claude"):
        if agent in lowered:
            return agent
    return "claude"


def _parse_crontab() -> list[dict]:
    try:
        result = subprocess.run(["crontab", "-l"], check=True, capture_output=True, text=True)
        content = result.stdout
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").lower()
        if "no crontab" in stderr:
            return []
        raise HTTPException(status_code=500, detail=exc.stderr.strip() or "Failed to read crontab") from exc

    items: list[dict] = []
    for index, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" in line.split()[0]:
            continue

        if line.startswith("@"):
            parts = line.split(maxsplit=1)
            if len(parts) < 2:
                continue
            schedule = parts[0]
            command = parts[1]
        else:
            parts = line.split(maxsplit=5)
            if len(parts) < 6:
                continue
            schedule = " ".join(parts[:5])
            command = parts[5]

        label = Path(command.split()[0]).name if command else f"cron-{index}"
        items.append(
            {
                "id": f"cron-{index:03d}",
                "label": label,
                "command": command,
                "schedule": schedule,
                "schedule_human": _humanize_cron(schedule),
                "agent": _infer_agent_from_command(command),
                "last_run": None,
            }
        )
    return items


@app.get("/api/agents")
def get_agents() -> list[dict]:
    sessions = _get_all_sessions()
    running_agents = get_running_agents()

    agents: dict[str, dict] = {}
    for agent_id, meta in AGENT_REGISTRY.items():
        agents[agent_id] = {
            **meta,
            "status": "active" if agent_id in running_agents else "idle",
            "sessions_count": 0,
            "total_cost_usd": 0.0,
            "last_active": None,
        }

    for session in sessions:
        agent_id = session.get("agent", "claude-code")
        if agent_id not in agents:
            continue
        agent = agents[agent_id]
        agent["sessions_count"] += 1
        agent["total_cost_usd"] = round(agent["total_cost_usd"] + session.get("cost_usd", 0.0), 6)

        sess_last = session.get("last_active")
        if sess_last and (agent["last_active"] is None or sess_last > agent["last_active"]):
            agent["last_active"] = sess_last
            if session.get("model"):
                agent["model"] = session["model"]

    return list(agents.values())


@app.get("/api/sessions")
def get_sessions() -> list[dict]:
    return _get_all_sessions()


@app.get("/api/stats")
def get_stats() -> dict:
    sessions = _get_all_sessions()

    total_cost = 0.0
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_write = 0
    total_cache_read = 0
    by_agent: dict[str, dict] = {}

    for session in sessions:
        agent_id = session.get("agent", "unknown")
        cost = session.get("cost_usd", 0.0)
        inp = session.get("input_tokens", 0)
        out = session.get("output_tokens", 0)
        cw = session.get("cache_write_tokens", 0)
        cr = session.get("cache_read_tokens", 0)

        total_cost += cost
        total_input_tokens += inp
        total_output_tokens += out
        total_cache_write += cw
        total_cache_read += cr

        if agent_id not in by_agent:
            by_agent[agent_id] = {
                "agent": agent_id,
                "name": AGENT_REGISTRY.get(agent_id, {}).get("name", agent_id),
                "sessions_count": 0,
                "total_cost_usd": 0.0,
                "input_tokens": 0,
                "output_tokens": 0,
            }
        by_agent[agent_id]["sessions_count"] += 1
        by_agent[agent_id]["total_cost_usd"] = round(by_agent[agent_id]["total_cost_usd"] + cost, 6)
        by_agent[agent_id]["input_tokens"] += inp
        by_agent[agent_id]["output_tokens"] += out

    return {
        "total_cost_usd": round(total_cost, 6),
        "total_sessions": len(sessions),
        "total_tokens": total_input_tokens + total_output_tokens + total_cache_write + total_cache_read,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "by_agent": list(by_agent.values()),
    }


@app.get("/api/processes")
def get_processes() -> dict:
    """Return currently running agent processes."""
    running = get_running_agents()
    return {"running": list(running)}


@app.get("/api/tasks/queue")
def get_task_queue() -> list[dict]:
    tasks: list[dict] = []
    for path in sorted(TASKS_DIR.glob("TASK-*.md")):
        if not path.is_file():
            continue
        task = _parse_task_file(path)
        if task["status"] in {"pending", "in-progress", "blocked"}:
            tasks.append(
                {
                    "id": task["id"],
                    "title": task["title"],
                    "status": task["status"],
                    "priority": task["priority"],
                    "deadline": task["deadline"],
                    "created": task["created"],
                    "updated": task["updated"],
                    "agent": task["agent"],
                    "background": task["background"],
                }
            )
    priority_order = {"P1": 0, "P2": 1, "P3": 2}
    tasks.sort(key=lambda item: (priority_order.get(item["priority"], 9), item["created"], item["id"]))
    return tasks


@app.get("/api/tasks/{task_id}")
def get_task_detail(task_id: str) -> dict:
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return _parse_task_file(path)


@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskPatchRequest) -> dict:
    if payload.status is None and payload.priority is None and payload.agent is None:
        raise HTTPException(status_code=400, detail="No changes requested")
    return _apply_task_patch(task_id, payload)


@app.get("/api/proposals")
def get_proposals() -> list[dict]:
    return _parse_proposals()


@app.get("/api/crons")
def get_crons() -> list[dict]:
    return _parse_crontab()


@app.get("/api/live/runs")
async def list_live_runs() -> dict:
    return {"runs": await LIVE_RUN_MANAGER.list_runs()}


@app.post("/api/live/runs")
async def create_live_run(payload: LiveRunCreateRequest) -> dict:
    try:
        run = await LIVE_RUN_MANAGER.create_run(
            command_text=payload.command,
            cwd=payload.cwd,
            label=payload.label,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": run.summary()}


@app.get("/api/live/runs/{run_id}")
async def get_live_run(run_id: str) -> dict:
    payload = await LIVE_RUN_MANAGER.get_run_payload(run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return payload


@app.post("/api/live/runs/{run_id}/stop")
async def stop_live_run(run_id: str) -> dict:
    run = await LIVE_RUN_MANAGER.stop_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run": run.summary()}


@app.websocket("/ws/live/runs/{run_id}")
async def live_run_websocket(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    run, queue = await LIVE_RUN_MANAGER.subscribe(run_id)
    if run is None:
        await websocket.send_json({"kind": "error", "message": "Run not found"})
        await websocket.close(code=4404)
        return

    await websocket.send_json({"kind": "snapshot", "run": run.summary()})
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        await LIVE_RUN_MANAGER.unsubscribe(run_id, queue)


async def _event_generator() -> AsyncGenerator[str, None]:
    while True:
        yield "event: update\ndata: {}\n\n"
        await asyncio.sleep(10)


@app.get("/api/events")
async def get_events() -> StreamingResponse:
    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
