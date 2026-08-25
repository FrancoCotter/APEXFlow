#!/usr/bin/env bash
# Enable trusted HTTPS for an existing APEXFlow installation on macOS/Linux.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================="
echo "  Enable APEXFlow HTTPS"
echo "=================================="
echo

if ! command -v node >/dev/null 2>&1 || [ ! -d node_modules ] || [ ! -d server/node_modules ]; then
  echo "APEXFlow dependencies were not found."
  echo "Run ./setup.sh first, then run ./enable-https.sh again."
  exit 1
fi

MKCERT_BIN=""
if [ -x .tools/mkcert/mkcert ]; then
  MKCERT_BIN="$SCRIPT_DIR/.tools/mkcert/mkcert"
elif command -v mkcert >/dev/null 2>&1; then
  MKCERT_BIN="$(command -v mkcert)"
else
  OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
  CPU_NAME="$(uname -m)"
  case "$CPU_NAME" in
    x86_64|amd64) CPU_NAME="amd64" ;;
    arm64|aarch64) CPU_NAME="arm64" ;;
    *)
      echo "Unsupported CPU architecture: $CPU_NAME"
      exit 1
      ;;
  esac
  case "$OS_NAME" in
    darwin|linux) ;;
    *)
      echo "Unsupported operating system: $OS_NAME"
      exit 1
      ;;
  esac

  echo "Downloading the official mkcert v1.4.4 portable binary..."
  mkdir -p .tools/mkcert
  curl -fL \
    "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-${OS_NAME}-${CPU_NAME}" \
    -o .tools/mkcert/mkcert
  chmod 700 .tools/mkcert/mkcert
  MKCERT_BIN="$SCRIPT_DIR/.tools/mkcert/mkcert"
fi

if ! "$MKCERT_BIN" -version 2>/dev/null | grep -q 'v1.4.4'; then
  echo "Warning: using an existing mkcert version other than v1.4.4."
fi

echo "Installing the APEXFlow local CA into the system trust store..."
"$MKCERT_BIN" -install

LOCAL_IP=""
if [ "$(uname -s)" = "Darwin" ]; then
  DEFAULT_INTERFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [ -n "$DEFAULT_INTERFACE" ]; then
    LOCAL_IP="$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null || true)"
  fi
elif command -v ip >/dev/null 2>&1; then
  LOCAL_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
fi

HOST_NAME="$(hostname -s 2>/dev/null || hostname)"
CERT_NAMES=(localhost 127.0.0.1 ::1 "$HOST_NAME" "$HOST_NAME.local")
if [ -n "$LOCAL_IP" ]; then
  CERT_NAMES+=("$LOCAL_IP")
fi

mkdir -p certs/local
echo "Generating the APEXFlow server certificate..."
"$MKCERT_BIN" \
  -cert-file certs/local/apexflow-cert.pem \
  -key-file certs/local/apexflow-key.pem \
  "${CERT_NAMES[@]}"

MKCERT_CAROOT="$("$MKCERT_BIN" -CAROOT)"
cp "$MKCERT_CAROOT/rootCA.pem" certs/local/apexflow-rootCA.pem
chmod 600 certs/local/apexflow-key.pem

echo
echo "=================================="
echo "  HTTPS Certificate Ready!"
echo "=================================="
echo
echo "  Local: https://localhost:3000"
if [ -n "$LOCAL_IP" ]; then
  echo "  LAN:   https://$LOCAL_IP:3000"
fi
echo
echo "Run ./start.sh and choose HTTPS when prompted."
echo "If a different Mac will access this computer over LAN, copy only"
echo "certs/local/apexflow-rootCA.pem and follow docs/HTTPS_SETUP.md."
echo
echo "Never share apexflow-key.pem or rootCA-key.pem."
