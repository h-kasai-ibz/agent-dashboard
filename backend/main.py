"""FastAPI backend for the AI Agent Activity Dashboard."""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

sys.path.insert(0, str(Path(__file__).parent))

from parsers import claude_code, goose  # noqa: E402
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

AGENT_REGISTRY: dict[str, dict] = {
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
    "goose": {
        "id": "goose",
        "name": "Goose",
        "model": "gemini-2.5-flash",
        "color": "purple",
    },
}


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
    sessions.extend(goose.get_all_sessions())
    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions


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
