#!/usr/bin/env bash
# Fix sudoers configuration for sandbox user

set -euo pipefail

SANDBOX_USER="${SANDBOX_USER:-sandboxuser}"
SUDOERS_FILE="/etc/sudoers.d/sandboxuser"

echo "[sandbox] Fixing sudoers configuration..."

# Get the actual user who will run the backend
ACTUAL_USER="${SUDO_USER:-$(whoami)}"

echo "[sandbox] Configuring passwordless sudo for user '${ACTUAL_USER}' to run commands as '${SANDBOX_USER}'"

# Write correct sudoers configuration
sudo tee ${SUDOERS_FILE} > /dev/null <<EOF
# Allow ${ACTUAL_USER} to run commands as ${SANDBOX_USER} without password
${ACTUAL_USER} ALL=(${SANDBOX_USER}) NOPASSWD: ALL

# Also allow the sandbox user to run basic commands
${SANDBOX_USER} ALL=(${SANDBOX_USER}) NOPASSWD: ALL
EOF

# Set correct permissions
sudo chmod 440 ${SUDOERS_FILE}

echo "[sandbox] Sudoers file updated: ${SUDOERS_FILE}"

# Test the setup
echo "[sandbox] Testing sandbox user setup..."
if sudo -u ${SANDBOX_USER} bash -c "echo 'Test successful - no password required!'" 2>/dev/null; then
    echo "[sandbox] ✓ Sandbox user is working correctly"
else
    echo "[sandbox] ✗ Failed to run command as sandbox user"
    echo "[sandbox] You may need to log out and back in for sudoers changes to take effect"
fi

echo ""
echo "Configuration complete! Your user '${ACTUAL_USER}' can now run commands as '${SANDBOX_USER}' without a password."
echo ""
echo "Test it with:"
echo "  sudo -u ${SANDBOX_USER} ls -la"