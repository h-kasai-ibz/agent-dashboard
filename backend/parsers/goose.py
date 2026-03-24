"""Parser for Goose session files at ~/.local/share/goose/sessions/"""
from __future__ import annotations

import json
from pathlib import Path

from cost import calculate_cost


GOOSE_SESSIONS_DIR = Path.home() / ".local" / "share" / "goose" / "sessions"


def get_all_sessions() -> list[dict]:
    """Walk Goose sessions directory and return parsed sessions (empty if missing)."""
    sessions: list[dict] = []

    if not GOOSE_SESSIONS_DIR.exists():
        return sessions

    for session_file in GOOSE_SESSIONS_DIR.iterdir():
        if not session_file.is_file():
            continue
        session = _parse_goose_session(session_file)
        if session is not None:
            sessions.append(session)

    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions


def _parse_goose_session(path: Path) -> dict | None:
    """Parse a single Goose session file."""
    session_id = path.stem
    input_tokens = 0
    output_tokens = 0
    cache_write_tokens = 0
    cache_read_tokens = 0
    message_count = 0
    started_at: str | None = None
    last_active: str | None = None
    first_message: str = ""
    model: str = "gemini-2.5-pro"

    try:
        suffix = path.suffix.lower()

        if suffix == ".jsonl":
            lines = []
            with open(path, encoding="utf-8", errors="replace") as f:
                for raw_line in f:
                    raw_line = raw_line.strip()
                    if not raw_line:
                        continue
                    try:
                        lines.append(json.loads(raw_line))
                    except json.JSONDecodeError:
                        continue
            entries = lines

        elif suffix == ".json":
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    entries = data
                elif isinstance(data, dict):
                    entries = data.get("messages", [data])
                else:
                    return None
            except (json.JSONDecodeError, OSError):
                return None
        else:
            # Try JSONL first, fall back to JSON
            entries = []
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    for raw_line in f:
                        raw_line = raw_line.strip()
                        if not raw_line:
                            continue
                        try:
                            entries.append(json.loads(raw_line))
                        except json.JSONDecodeError:
                            break
            except OSError:
                return None

    except OSError:
        return None

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        ts = entry.get("timestamp") or entry.get("created_at")
        if ts:
            if started_at is None:
                started_at = str(ts)
            last_active = str(ts)

        role = entry.get("role")
        if role == "user":
            message_count += 1
            if not first_message:
                content = entry.get("content", "")
                if isinstance(content, str):
                    first_message = content[:200]
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            first_message = block.get("text", "")[:200]
                            break

        elif role == "assistant":
            message_count += 1
            usage = entry.get("usage", {})
            if usage:
                input_tokens += usage.get("input_tokens", usage.get("prompt_tokens", 0))
                output_tokens += usage.get("output_tokens", usage.get("completion_tokens", 0))
            entry_model = entry.get("model")
            if entry_model:
                model = entry_model

    if started_at is None:
        return None

    cost = calculate_cost(model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens)

    return {
        "id": session_id,
        "agent": "goose",
        "project": "goose",
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
