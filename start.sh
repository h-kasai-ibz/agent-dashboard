#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Agent Dashboard ===${NC}"

# ── Resolve pip / uvicorn ────────────────────────────────────────────────────
# Try to find pip3: user-installed first, then system PATH
PIP=""
for candidate in "$HOME/.local/bin/pip3" "$HOME/.local/bin/pip" "pip3" "pip"; do
  if command -v "$candidate" &>/dev/null || [ -x "$candidate" ]; then
    PIP="$candidate"
    break
  fi
done

if [ -z "$PIP" ]; then
  echo -e "${YELLOW}pip not found — bootstrapping via get-pip.py...${NC}"
  curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  python3 /tmp/get-pip.py --user --quiet --break-system-packages
  PIP="$HOME/.local/bin/pip3"
fi

# Try venv first (cleaner); fall back to --user install if python3-venv missing
VENV_DIR="$BACKEND_DIR/.venv"
PYTHON=""
UVICORN=""

if python3 -m venv "$VENV_DIR" 2>/dev/null; then
  echo -e "${YELLOW}Installing Python dependencies (venv)...${NC}"
  "$VENV_DIR/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
  PYTHON="$VENV_DIR/bin/python3"
  UVICORN="$VENV_DIR/bin/uvicorn"
else
  echo -e "${YELLOW}Installing Python dependencies (user)...${NC}"
  "$PIP" install -q -r "$BACKEND_DIR/requirements.txt" --break-system-packages
  PYTHON="python3"
  UVICORN="$HOME/.local/bin/uvicorn"
fi

# ── Node modules ─────────────────────────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing Node dependencies...${NC}"
  cd "$FRONTEND_DIR" && npm install
  cd "$SCRIPT_DIR"
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Stopping services...${NC}"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# ── Start backend ─────────────────────────────────────────────────────────────
echo -e "${GREEN}Starting backend  → http://localhost:8000${NC}"
cd "$BACKEND_DIR"
"$UVICORN" main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Give backend a moment to start before frontend
sleep 1

# ── Start frontend ────────────────────────────────────────────────────────────
echo -e "${GREEN}Starting frontend → http://localhost:5173${NC}"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo -e "${BLUE}Both services running.${NC}"
echo -e "  Backend:  ${GREEN}http://localhost:8000${NC}"
echo -e "  Frontend: ${GREEN}http://localhost:5173${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop.${NC}"

wait "$BACKEND_PID" "$FRONTEND_PID"
