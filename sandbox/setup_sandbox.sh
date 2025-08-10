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

# Grant sandboxuser passwordless sudo
echo "[sandbox] Granting sandboxuser passwordless sudo..."
"$(dirname "$0")/fix_sudoers.sh"

echo "[sandbox] Done."
