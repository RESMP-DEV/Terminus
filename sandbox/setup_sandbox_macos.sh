#!/usr/bin/env bash
# macOS sandbox user setup script
# Creates a restricted user for sandboxed command execution

set -euo pipefail

SANDBOX_USER="${SANDBOX_USER:-sandboxuser}"
SANDBOX_UID="${SANDBOX_UID:-9999}"

echo "[sandbox] macOS Sandbox Setup"
echo "[sandbox] Creating user '${SANDBOX_USER}' with UID ${SANDBOX_UID}..."

# Check if user already exists
if dscl . -list /Users | grep -q "^${SANDBOX_USER}$"; then
    echo "[sandbox] User '${SANDBOX_USER}' already exists. Skipping creation."
else
    # Find next available UID if specified one is taken
    if dscl . -list /Users UniqueID | grep -q "^${SANDBOX_USER} ${SANDBOX_UID}$"; then
        echo "[sandbox] UID ${SANDBOX_UID} is already in use, finding next available..."
        SANDBOX_UID=$(dscl . -list /Users UniqueID | awk '{print $2}' | sort -n | tail -1)
        SANDBOX_UID=$((SANDBOX_UID + 1))
        echo "[sandbox] Using UID ${SANDBOX_UID}"
    fi

    # Create the user
    echo "[sandbox] Creating user account..."
    sudo dscl . -create /Users/${SANDBOX_USER}
    sudo dscl . -create /Users/${SANDBOX_USER} UniqueID ${SANDBOX_UID}
    sudo dscl . -create /Users/${SANDBOX_USER} PrimaryGroupID 20  # staff group
    sudo dscl . -create /Users/${SANDBOX_USER} UserShell /bin/bash
    sudo dscl . -create /Users/${SANDBOX_USER} RealName "Sandbox User"
    sudo dscl . -create /Users/${SANDBOX_USER} NFSHomeDirectory /var/empty
    
    # Set a random password (user won't be able to login interactively)
    RANDOM_PASS=$(openssl rand -base64 32)
    sudo dscl . -passwd /Users/${SANDBOX_USER} "${RANDOM_PASS}"
    
    echo "[sandbox] Created user '${SANDBOX_USER}' with UID ${SANDBOX_UID}"
fi

# Configure sudoers for passwordless execution
SUDOERS_FILE="/etc/sudoers.d/sandboxuser"
echo "[sandbox] Configuring sudo permissions..."

# Create sudoers.d directory if it doesn't exist
if [ ! -d /etc/sudoers.d ]; then
    sudo mkdir -p /etc/sudoers.d
    echo "[sandbox] Created /etc/sudoers.d directory"
fi

# Write sudoers configuration
# Allow current user to run commands as sandboxuser without password
CURRENT_USER=$(whoami)
sudo tee ${SUDOERS_FILE} > /dev/null <<EOF
# Allow ${CURRENT_USER} to run commands as ${SANDBOX_USER} without password
${CURRENT_USER} ALL=(${SANDBOX_USER}) NOPASSWD: ALL
EOF

# Set correct permissions
sudo chmod 440 ${SUDOERS_FILE}

echo "[sandbox] Sudoers configured for user '${CURRENT_USER}' to run commands as '${SANDBOX_USER}'"

# Test the setup
echo "[sandbox] Testing sandbox user setup..."
if sudo -u ${SANDBOX_USER} bash -c "echo 'Sandbox test successful'" 2>/dev/null; then
    echo "[sandbox] ✓ Sandbox user is working correctly"
else
    echo "[sandbox] ✗ Failed to run command as sandbox user"
    echo "[sandbox] You may need to restart your terminal or run 'sudo -v' first"
fi

echo "[sandbox] Setup complete!"
echo ""
echo "Next steps:"
echo "1. Remove or comment out 'SANDBOX_FORCE_LOCAL=true' from your .env file"
echo "2. Restart the backend server"
echo "3. Commands will now run as the sandboxuser"