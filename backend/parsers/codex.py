"""Parser for Codex CLI SQLite session data (~/.codex/state_5.sqlite).
Supports multiple user instances (kasai, clawadmin, etc.)
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


# Instances to monitor: (user, db_path, agent_id, display_name)
CODEX_INSTANCES = [
    ("kasai",     Path("/home/kasai/.codex/state_5.sqlite"),     "codex-kasai",     "Codex (kasai)"),
    ("clawadmin", Path("/home/clawadmin/.codex/state_5.sqlite"), "codex-clawadmin", "Codex (clawadmin)"),
]

# Approximate pricing per 1M tokens (USD) — 70% input / 30% output split
CODEX_PRICING = {
    "gpt-5.4":       {"input": 2.0,  "output": 8.0},
    "gpt-5.3-codex": {"input": 2.0,  "output": 8.0},
    "o4-mini":       {"input": 1.1,  "output": 4.4},
    "o3":            {"input": 10.0, "output": 40.0},
}


def _ts_to_iso(unix_ts: int | None) -> str | None:
    if not unix_ts:
        return None
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()


def _codex_cost(model: str, tokens_used: int) -> float:
    pricing = CODEX_PRICING.get(model, {"input": 2.0, "output": 8.0})
    input_t  = int(tokens_used * 0.7)
    output_t = int(tokens_used * 0.3)
    return (input_t * pricing["input"] + output_t * pricing["output"]) / 1_000_000


def _get_sessions_for_instance(user: str, db_path: Path, agent_id: str) -> list[dict]:
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path))
        rows = conn.execute(
            """SELECT id, created_at, updated_at, model_provider, title,
                      tokens_used, first_user_message, cwd
               FROM threads
               ORDER BY updated_at DESC"""
        ).fetchall()
        conn.close()
    except Exception:
        return []

    sessions = []
    for row in rows:
        sid, created_at, updated_at, model_provider, title, tokens_used, first_msg, cwd = row
        model = "gpt-5.4"
        cost = _codex_cost(model, tokens_used or 0)
        sessions.append({
            "id": sid,
            "agent": agent_id,
            "project": cwd or f"/home/{user}",
            "started_at": _ts_to_iso(created_at),
            "last_active": _ts_to_iso(updated_at),
            "message_count": 0,
            "input_tokens": int((tokens_used or 0) * 0.7),
            "output_tokens": int((tokens_used or 0) * 0.3),
            "cache_write_tokens": 0,
            "cache_read_tokens": 0,
            "cost_usd": cost,
            "first_message": (first_msg or title or "")[:200],
            "model": model,
        })
    return sessions


def get_all_sessions() -> list[dict]:
    sessions = []
    for user, db_path, agent_id, _ in CODEX_INSTANCES:
        sessions.extend(_get_sessions_for_instance(user, db_path, agent_id))
    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions


def get_agent_info() -> list[dict]:
    agents = []
    for user, db_path, agent_id, display_name in CODEX_INSTANCES:
        sessions = _get_sessions_for_instance(user, db_path, agent_id)
        total_cost = sum(s["cost_usd"] for s in sessions)
        last_active = max((s["last_active"] for s in sessions if s["last_active"]), default=None)
        agents.append({
            "id": agent_id,
            "name": display_name,
            "model": "gpt-5.4",
            "sessions_count": len(sessions),
            "total_cost_usd": total_cost,
            "last_active": last_active,
        })
    return agents
