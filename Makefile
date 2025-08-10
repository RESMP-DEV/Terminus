# Variables
PYTHON := python3
PIP := $(PYTHON) -m pip
VENV := .venv
ACTIVATE := . $(VENV)/bin/activate

APP := agent_core.main:build_asgi
HOST ?= 0.0.0.0
PORT ?= 8000

.PHONY: help
help:
\t@echo "Targets:"
\t@echo "  make venv          - Create virtual environment"
\t@echo "  make install       - Install backend dependencies"
\t@echo "  make dev           - Run backend with reload"
\t@echo "  make start         - Run backend without reload"
\t@echo "  make sandbox       - Provision sandbox user/tools"
\t@echo "  make lint          - Run linters via pre-commit (if installed)"
\t@echo "  make test          - Run tests (pytest placeholder)"
\t@echo "  make clean         - Remove caches and build artifacts"

.PHONY: venv
venv:
\t@if [ ! -d "$(VENV)" ]; then $(PYTHON) -m venv $(VENV); fi

.PHONY: install
install: venv
\t$(ACTIVATE) && $(PIP) install --upgrade pip
\t$(ACTIVATE) && $(PIP) install -r requirements.txt

.PHONY: dev
dev:
\t$(ACTIVATE) && uvicorn $(APP) --factory --reload --host $(HOST) --port $(PORT)

.PHONY: start
start:
\t$(ACTIVATE) && uvicorn $(APP) --factory --host $(HOST) --port $(PORT)

.PHONY: sandbox
sandbox:
\tbash sandbox/setup_sandbox.sh

.PHONY: lint
lint:
\t@if command -v pre-commit >/dev/null 2>&1; then \\
\t\tpre-commit run --all-files; \\
\telse \\
\t\techo "pre-commit not found. Install with: pip install pre-commit"; \\
\tfi

.PHONY: test
test:
\t@if command -v pytest >/dev/null 2>&1; then \\
\t\tpytest -q; \\
\telse \\
\t\techo "pytest not found. Install with: pip install pytest"; \\
\tfi

.PHONY: clean
clean:
\trm -rf .pytest_cache .mypy_cache dist build
\tfind . -type d -name "__pycache__" -prune -exec rm -rf {} +
