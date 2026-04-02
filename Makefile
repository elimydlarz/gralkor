.PHONY: test test-plugin test-functional test-server test-mutate \
        typecheck pack build-server up down logs setup-server help


help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Testing"
	@echo "  test            Run all tests (plugin + functional + server)"
	@echo "  test-plugin     TypeScript unit tests only (vitest)"
	@echo "  test-functional TypeScript functional tests (test/functional/)"
	@echo "  test-server     Python server tests only (no Docker needed)"
	@echo "  test-mutate     Mutation testing (TypeScript, Stryker)"
	@echo "  typecheck       TypeScript type-check"
	@echo ""
	@echo "Build"
	@echo "  pack            Build deployment tarball"
	@echo ""
	@echo "Docker"
	@echo "  build-server    Build gralkor-server Docker image"
	@echo "  up              Start FalkorDB + Graphiti services"
	@echo "  down            Stop services"
	@echo "  logs            Tail Graphiti logs"
	@echo ""
	@echo "Setup"
	@echo "  setup-server    Create server venv and install Python deps (first time only)"

test: typecheck test-plugin test-functional test-server

test-plugin:
	pnpm exec vitest run

test-functional:
	pnpm exec vitest run --config test/functional/vitest.config.ts

test-server:
	cd server && uv run pytest tests/

test-mutate:
	pnpm exec stryker run

test-server-changed:
	@cd server && files=$$(git diff --name-only --diff-filter=d HEAD -- 'tests/*.py'); \
	if [ -n "$$files" ]; then uv run pytest $$files; else echo "No changed server test files"; fi

typecheck:
	pnpm exec tsc --noEmit

setup-server:
	cd server && uv sync

pack:
	bash scripts/pack.sh

build-server:
	docker build -t gralkor-server:latest server/

up: build-server
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs graphiti
