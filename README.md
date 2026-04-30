# agent-dashboard

Local dashboard for AI agent activity and live CLI JSON streams.

## Run

```bash
./start.sh
```

- Frontend: `http://localhost:5170`
- Backend API: `http://localhost:8001`

## Live Run

The `Live Run` tab starts a local CLI command and streams each output line to the browser.

Recommended command format:

```bash
claude -p --output-format json "Summarize this repository in 3 bullets."
```

You can also use any command that writes line-delimited JSON to stdout, for example:

```bash
python3 -c 'import json,time; print(json.dumps({"type":"tick","n":1})); time.sleep(1); print(json.dumps({"type":"tick","n":2}))'
```

What the backend does:

- Starts the command as a local subprocess
- Stores the latest events in memory
- Exposes run metadata over `/api/live/runs`
- Streams events over `ws://localhost:8001/ws/live/runs/{run_id}`

## Verification

```bash
cd backend && python3 -m py_compile *.py parsers/*.py
cd ../frontend && npm run build
```
