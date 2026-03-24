"""Parser for Gemini CLI session files at ~/.gemini/tmp/*/chats/"""
from __future__ import annotations

import json
from pathlib import Path


GEMINI_TMP_DIR = Path.home() / ".gemini" / "tmp"


def parse_session_file(json_path: Path, project: str) -> dict | None:
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None

    session_id = data.get("sessionId", json_path.stem)
    started_at = data.get("startTime")
    last_active = data.get("lastUpdated") or started_at
    messages = data.get("messages", [])

    first_message = ""
    message_count = 0

    for msg in messages:
        msg_type = msg.get("type", "")
        if msg_type == "user":
            message_count += 1
            if not first_message:
                content = msg.get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict):
                            text = block.get("text", "")
                            if text and not text.startswith("/"):
                                first_message = text[:200]
                                break
                elif isinstance(content, str):
                    first_message = content[:200]
        elif msg_type == "gemini":
            message_count += 1

    if not started_at:
        return None

    return {
        "id": session_id,
        "agent": "gemini",
        "project": project,
        "started_at": started_at,
        "last_active": last_active,
        "message_count": message_count,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_write_tokens": 0,
        "cache_read_tokens": 0,
        "cost_usd": 0.0,
        "first_message": first_message,
        "model": "gemini-2.5-flash",
    }


def get_all_sessions() -> list[dict]:
    sessions: list[dict] = []
    if not GEMINI_TMP_DIR.exists():
        return sessions

    for project_dir in GEMINI_TMP_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        chats_dir = project_dir / "chats"
        if not chats_dir.exists():
            continue
        project_name = project_dir.name
        for json_file in chats_dir.glob("session-*.json"):
            session = parse_session_file(json_file, project_name)
            if session is not None:
                sessions.append(session)

    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions
