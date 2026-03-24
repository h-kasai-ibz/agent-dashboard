"""Parser for Claude Code JSONL session files at ~/.claude/projects/"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cost import calculate_cost


CLAUDE_INSTANCES = [
    ("kasai",     Path("/home/kasai/.claude/projects"),     "claude-code-kasai",     "Claude Code (kasai)"),
    ("clawadmin", Path("/home/clawadmin/.claude/projects"), "claude-code-clawadmin", "Claude Code (clawadmin)"),
    ("clawuser",  Path("/home/clawuser/.claude/projects"),  "claude-code-clawuser",  "Claude Code (clawuser)"),
]


def _extract_text_content(content: Any) -> str:
    """Extract plain text from a message content field (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    parts.append(f"[tool: {block.get('name', 'unknown')}]")
        return " ".join(p for p in parts if p).strip()
    return ""


def parse_session_file(jsonl_path: Path, project: str, agent_id: str = "claude-code-kasai") -> dict | None:
    """Parse a single JSONL session file and return a session dict."""
    session_id = jsonl_path.stem

    input_tokens = 0
    output_tokens = 0
    cache_write_tokens = 0
    cache_read_tokens = 0
    message_count = 0
    started_at: str | None = None
    last_active: str | None = None
    first_message: str = ""
    model: str = "claude-sonnet-4-6"

    try:
        with open(jsonl_path, encoding="utf-8") as f:
            for raw_line in f:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    entry = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                entry_type = entry.get("type")
                ts = entry.get("timestamp")

                if ts:
                    if started_at is None:
                        started_at = ts
                    last_active = ts

                if entry_type == "user":
                    msg = entry.get("message", {})
                    # Skip meta / internal messages
                    if entry.get("isMeta"):
                        continue
                    message_count += 1
                    if not first_message:
                        content = msg.get("content", "")
                        first_message = _extract_text_content(content)[:200]

                elif entry_type == "assistant":
                    msg = entry.get("message", {})
                    usage = msg.get("usage", {})
                    if usage:
                        input_tokens += usage.get("input_tokens", 0)
                        output_tokens += usage.get("output_tokens", 0)
                        cache_write_tokens += usage.get("cache_creation_input_tokens", 0)
                        cache_read_tokens += usage.get("cache_read_input_tokens", 0)
                        entry_model = msg.get("model")
                        if entry_model:
                            model = entry_model
                    message_count += 1

    except OSError:
        return None

    if started_at is None and last_active is None:
        return None

    cost = calculate_cost(model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens)

    return {
        "id": session_id,
        "agent": agent_id,
        "project": project,
        "started_at": started_at,
        "last_active": last_active,
        "message_count": message_count,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_write_tokens": cache_write_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cost_usd": cost,
        "first_message": first_message,
        "model": model,
    }


def get_all_sessions() -> list[dict]:
    """Walk each user's ~/.claude/projects/ and return all parsed sessions."""
    sessions: list[dict] = []

    for _user, projects_dir, agent_id, _name in CLAUDE_INSTANCES:
        if not projects_dir.exists():
            continue
        for project_dir in projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            project_name = project_dir.name
            for jsonl_file in project_dir.glob("*.jsonl"):
                session = parse_session_file(jsonl_file, project_name, agent_id)
                if session is not None:
                    sessions.append(session)

    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions
