#!/usr/bin/env bash
# Idempotent sandbox setup script
# - Creates low-privilege user (default: sandboxuser)
# - Installs base tooling if apt-get is available
# - Optionally configures sudoers NOPASSWD for a designated service user
#   (set SUDOERS_SERVICE_USER=username before running to enable)

set -euo pipefail

SANDBOX_USER="${SANDBOX_USER:-sandboxuser}"

echo "[sandbox] Ensuring user '${SANDBOX_USER}' exists..."
if id -u "${SANDBOX_USER}" >/dev/null 2>&1; then
  echo "[sandbox] User '${SANDBOX_USER}' already exists. Skipping creation."
else
  sudo useradd -m "${SANDBOX_USER}"
  echo "[sandbox] Created user '${SANDBOX_USER}'."
fi

# Install necessary tools where apt-get is present
if command -v apt-get >/dev/null 2>&1; then
  echo "[sandbox] Installing base packages via apt-get..."
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git python3 python3-pip curl wget build-essential
else
  echo "[sandbox] 'apt-get' not found. Skipping package installation."
fi

# Optional: configure sudoers to allow the service user to run commands as SANDBOX_USER without password.
# This is often required for non-interactive servers. Only applied if SUDOERS_SERVICE_USER is set.
if [[ -n "${SUDOERS_SERVICE_USER:-}" ]]; then
  SUDOERS_FILE="/etc/sudoers.d/terminus-sandbox"
  LINE="${SUDOERS_SERVICE_USER} ALL=(${SANDBOX_USER}) NOPASSWD: /bin/bash, /usr/bin/bash, /bin/sh, /usr/bin/sh"
  echo "[sandbox] Adding sudoers rule for '${SUDOERS_SERVICE_USER}' -> '${SANDBOX_USER}' in ${SUDOERS_FILE}"
  # Write using a temp file to avoid partial writes, then validate with visudo
  TMP=$(mktemp)
  echo "${LINE}" > "${TMP}"
  sudo install -o root -g root -m 440 "${TMP}" "${SUDOERS_FILE}"
  rm -f "${TMP}"
  # Validate
  if sudo visudo -c >/dev/null 2>&1; then
    echo "[sandbox] Sudoers configuration validated."
  else
    echo "[sandbox] WARNING: visudo reported an issue with sudoers configuration."
  fi
else
  echo "[sandbox] SUDOERS_SERVICE_USER not set. Skipping sudoers configuration."
fi

echo "[sandbox] Done."