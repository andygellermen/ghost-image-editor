#!/bin/sh

set -eu

MIN_NODE_MAJOR="${GHOST_IMAGE_EDITOR_MIN_NODE_MAJOR:-18}"
NODE_VERSION="${GHOST_IMAGE_EDITOR_NODE_VERSION:-20.20.2}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_ROOT="${REPO_ROOT}/.local-runtime/node"

current_node_major() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  node --version 2>/dev/null | sed 's/^v//; s/\..*$//'
}

download_file() {
  url="$1"
  destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
    return 0
  fi

  echo "Build failed: neither curl nor wget is available to download a modern Node.js runtime." >&2
  exit 1
}

install_local_node() {
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    darwin|linux)
      ;;
    *)
      echo "Build failed: automatic Node.js runtime download is only supported on macOS and Linux. Detected OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    arm64|aarch64)
      node_arch="arm64"
      ;;
    x86_64|amd64)
      node_arch="x64"
      ;;
    *)
      echo "Build failed: unsupported CPU architecture for automatic Node.js runtime download: $arch" >&2
      exit 1
      ;;
  esac

  archive_name="node-v${NODE_VERSION}-${os}-${node_arch}.tar.gz"
  archive_url="https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}"
  install_dir="${RUNTIME_ROOT}/node-v${NODE_VERSION}-${os}-${node_arch}"
  node_bin="${install_dir}/bin/node"

  if [ -x "$node_bin" ]; then
    printf '%s\n' "$node_bin"
    return 0
  fi

  mkdir -p "$RUNTIME_ROOT"

  tmp_archive="${RUNTIME_ROOT}/${archive_name}.tmp"
  rm -f "$tmp_archive"

  echo "System node is too old for Vite. Downloading local Node.js v${NODE_VERSION}..." >&2
  download_file "$archive_url" "$tmp_archive"

  tar -xzf "$tmp_archive" -C "$RUNTIME_ROOT"
  rm -f "$tmp_archive"

  if [ ! -x "$node_bin" ]; then
    echo "Build failed: downloaded Node.js runtime is incomplete: $node_bin" >&2
    exit 1
  fi

  printf '%s\n' "$node_bin"
}

if [ "$#" -eq 0 ]; then
  echo "Usage: sh scripts/run-with-modern-node.sh <script-or-js-file> [args...]" >&2
  exit 1
fi

SYSTEM_NODE_MAJOR="$(current_node_major || true)"
if [ -n "$SYSTEM_NODE_MAJOR" ] && [ "$SYSTEM_NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  exec node "$@"
fi

LOCAL_NODE_BIN="$(install_local_node)"
exec "$LOCAL_NODE_BIN" "$@"
