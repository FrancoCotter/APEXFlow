#!/bin/bash
# Start APEXFlow (both frontend and backend)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check ACE-Step path
if [ ! -d "$ACESTEP_PATH" ]; then
    echo "Error: ACESTEP_PATH not set or invalid. Run ./setup.sh first."
    exit 1
fi

APP_SCHEME="http"
USE_HTTPS="false"
printf "Start APEXFlow with HTTPS? [y/N]: "
read -r HTTPS_CHOICE || HTTPS_CHOICE=""
case "$HTTPS_CHOICE" in
    y|Y|yes|YES|Yes)
        if [ -f "$SCRIPT_DIR/certs/local/apexflow-cert.pem" ] && [ -f "$SCRIPT_DIR/certs/local/apexflow-key.pem" ]; then
            APP_SCHEME="https"
            USE_HTTPS="true"
        else
            echo ""
            echo "HTTPS certificate was not found."
            echo "Run ./enable-https.sh first. APEXFlow will continue with HTTP this time."
            echo ""
        fi
        ;;
esac

echo "Starting APEXFlow..."
echo "ACE-Step: $ACESTEP_PATH"
echo ""

# Start backend in background
echo "Starting backend on port ${PORT:-3001}..."
cd server
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend
sleep 3

# Start frontend
echo "Starting frontend on port ${FRONTEND_PORT:-3000}..."
APEXFLOW_HTTPS="$USE_HTTPS" npm run dev &
FRONTEND_PID=$!

echo ""
echo "=================================="
echo "  APEXFlow Running"
echo "=================================="
echo ""
echo "  Frontend: $APP_SCHEME://localhost:${FRONTEND_PORT:-3000}"
echo "  Backend:  http://localhost:${PORT:-3001}"
echo ""
echo "Press Ctrl+C to stop..."

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait
