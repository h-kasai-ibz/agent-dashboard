"""Check which AI agents are currently running via process list."""
from __future__ import annotations

import subprocess


AGENT_PROCESS_PATTERNS = {
    "claude-code": ["claude"],
    "codex": ["codex"],
    "gemini": ["gemini"],
    "goose": ["goose"],
}


def get_running_agents() -> set[str]:
    """Return set of agent IDs that have at least one running process."""
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        output = result.stdout
    except (subprocess.TimeoutExpired, OSError):
        return set()

    running: set[str] = set()
    for agent_id, patterns in AGENT_PROCESS_PATTERNS.items():
        for pattern in patterns:
            # Match binary name but exclude grep itself and this python process
            for line in output.splitlines():
                if pattern in line and "grep" not in line and "python" not in line and "dashboard" not in line:
                    running.add(agent_id)
                    break

    return running
