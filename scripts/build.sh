#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

sh "${SCRIPT_DIR}/run-with-modern-node.sh" "${REPO_ROOT}/scripts/ensure-native-runtime-deps.mjs"
sh "${SCRIPT_DIR}/run-with-modern-node.sh" "${REPO_ROOT}/node_modules/vite/bin/vite.js" build "$@"
sh "${SCRIPT_DIR}/run-with-modern-node.sh" "${REPO_ROOT}/scripts/verify-extension-build.mjs"
