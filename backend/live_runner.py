"""Manage locally spawned CLI runs and stream their output to WebSocket clients."""
from __future__ import annotations

import asyncio
import json
import os
import shlex
import uuid
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_cwd(cwd: str | None) -> str:
    if not cwd:
        return str(Path.home())
    return str(Path(cwd).expanduser())


@dataclass
class LiveRun:
    id: str
    command: list[str]
    cwd: str
    label: str
    created_at: str
    status: str = "queued"
    started_at: str | None = None
    finished_at: str | None = None
    return_code: int | None = None
    pid: int | None = None
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    seq: int = 0
    process: asyncio.subprocess.Process | None = None
    task: asyncio.Task[None] | None = None
    subscribers: set[asyncio.Queue] = field(default_factory=set)

    def push_event(self, event: dict[str, Any]) -> dict[str, Any]:
        self.seq += 1
        enriched = {
            "seq": self.seq,
            "run_id": self.id,
            "timestamp": _now_iso(),
            **event,
        }
        self.events.append(enriched)
        if len(self.events) > 500:
            self.events = self.events[-500:]
        for queue in list(self.subscribers):
            with suppress(asyncio.QueueFull):
                queue.put_nowait(enriched)
        return enriched

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "command": self.command,
            "cwd": self.cwd,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "return_code": self.return_code,
            "pid": self.pid,
            "error": self.error,
            "event_count": len(self.events),
        }


class LiveRunManager:
    def __init__(self) -> None:
        self._runs: dict[str, LiveRun] = {}
        self._lock = asyncio.Lock()

    async def create_run(self, command_text: str, cwd: str | None = None, label: str | None = None) -> LiveRun:
        command = shlex.split(command_text)
        if not command:
            raise ValueError("Command is empty")

        run_id = str(uuid.uuid4())
        resolved_cwd = _coerce_cwd(cwd)
        run = LiveRun(
            id=run_id,
            command=command,
            cwd=resolved_cwd,
            label=label or Path(command[0]).name,
            created_at=_now_iso(),
        )
        async with self._lock:
            self._runs[run_id] = run
        run.task = asyncio.create_task(self._execute_run(run))
        return run

    async def list_runs(self) -> list[dict[str, Any]]:
        async with self._lock:
            runs = [run.summary() for run in self._runs.values()]
        runs.sort(key=lambda item: item["created_at"], reverse=True)
        return runs

    async def get_run(self, run_id: str) -> LiveRun | None:
        async with self._lock:
            return self._runs.get(run_id)

    async def get_run_payload(self, run_id: str) -> dict[str, Any] | None:
        run = await self.get_run(run_id)
        if run is None:
            return None
        return {
            "run": run.summary(),
            "events": run.events[-200:],
        }

    async def subscribe(self, run_id: str) -> tuple[LiveRun | None, asyncio.Queue]:
        queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        run = await self.get_run(run_id)
        if run is None:
            return None, queue
        for event in run.events[-200:]:
            await queue.put(event)
        run.subscribers.add(queue)
        return run, queue

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        run = await self.get_run(run_id)
        if run is not None:
            run.subscribers.discard(queue)

    async def stop_run(self, run_id: str) -> LiveRun | None:
        run = await self.get_run(run_id)
        if run is None:
            return None
        process = run.process
        if process and process.returncode is None:
            process.terminate()
            run.push_event({"kind": "system", "message": "Terminate requested"})
        return run

    async def _execute_run(self, run: LiveRun) -> None:
        run.status = "starting"
        run.push_event(
            {
                "kind": "system",
                "message": "Process starting",
                "command": run.command,
                "cwd": run.cwd,
            }
        )

        try:
            process = await asyncio.create_subprocess_exec(
                *run.command,
                cwd=run.cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy(),
            )
        except (FileNotFoundError, NotADirectoryError, PermissionError, OSError) as exc:
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = _now_iso()
            run.push_event({"kind": "error", "message": str(exc)})
            return

        run.process = process
        run.pid = process.pid
        run.status = "running"
        run.started_at = _now_iso()
        run.push_event({"kind": "status", "status": "running", "pid": process.pid})

        stdout_task = asyncio.create_task(self._read_stream(run, process.stdout, "stdout"))
        stderr_task = asyncio.create_task(self._read_stream(run, process.stderr, "stderr"))

        return_code = await process.wait()
        await asyncio.gather(stdout_task, stderr_task)

        run.return_code = return_code
        run.finished_at = _now_iso()
        run.status = "completed" if return_code == 0 else "failed"
        run.push_event(
            {
                "kind": "status",
                "status": run.status,
                "return_code": return_code,
            }
        )

    async def _read_stream(
        self,
        run: LiveRun,
        stream: asyncio.StreamReader | None,
        stream_name: str,
    ) -> None:
        if stream is None:
            return

        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            payload: dict[str, Any] = {
                "kind": "stream",
                "stream": stream_name,
                "text": text,
            }
            if stream_name == "stdout":
                try:
                    payload["json"] = json.loads(text)
                    payload["format"] = "json"
                except json.JSONDecodeError:
                    payload["format"] = "text"
            else:
                payload["format"] = "text"
            run.push_event(payload)
