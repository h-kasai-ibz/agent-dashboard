"""Parser for Grok call logs at /home/kasai/logs/grok*.log."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

try:
    from cost import calculate_cost
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from backend.cost import calculate_cost


GROK_LOG_DIR = Path("/home/kasai/logs")
GROK_LOG_GLOB = "grok*.log"
GROK_LINE_RE = re.compile(
    r"^\[(?P<timestamp>[^\]]+)\]\s+model=(?P<model>\S+)\s+"
    r"prompt_chars=(?P<prompt_chars>\d+)\s+response_chars=(?P<response_chars>\d+)\s*$"
)


def _to_iso(timestamp: str) -> str:
    return datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S").isoformat()


def _parse_log_file(path: Path) -> list[dict]:
    sessions: list[dict] = []

    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line_no, raw_line in enumerate(f, start=1):
                match = GROK_LINE_RE.match(raw_line.strip())
                if not match:
                    continue

                ts = _to_iso(match.group("timestamp"))
                model = match.group("model")
                prompt_chars = int(match.group("prompt_chars"))
                response_chars = int(match.group("response_chars"))

                sessions.append({
                    "id": f"{path.stem}-{line_no}",
                    "agent": "grok",
                    "project": "grok",
                    "started_at": ts,
                    "last_active": ts,
                    "message_count": 2,
                    "input_tokens": prompt_chars,
                    "output_tokens": response_chars,
                    "cache_write_tokens": 0,
                    "cache_read_tokens": 0,
                    "cost_usd": calculate_cost(model, prompt_chars, response_chars),
                    "first_message": "",
                    "model": model,
                })
    except OSError:
        return []

    return sessions


def get_all_sessions() -> list[dict]:
    sessions: list[dict] = []

    if not GROK_LOG_DIR.exists():
        return sessions

    for log_file in sorted(GROK_LOG_DIR.glob(GROK_LOG_GLOB)):
        if not log_file.is_file():
            continue
        sessions.extend(_parse_log_file(log_file))

    sessions.sort(key=lambda s: s.get("last_active") or "", reverse=True)
    return sessions
