.PHONY: test test-plugin test-functional test-server test-cli test-mutate \
        typecheck pack publish publish-patch publish-minor publish-major \
        build-server up down logs setup-server help


help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Testing"
	@echo "  test            Run all tests (plugin + functional + server + cli)"
	@echo "  test-plugin     TypeScript unit tests only (vitest)"
	@echo "  test-functional TypeScript functional tests (test/functional/)"
	@echo "  test-server     Python server tests only (no Docker needed)"
	@echo "  test-cli        CLI package tests (vitest)"
	@echo "  test-mutate     Mutation testing (TypeScript, Stryker)"
	@echo "  typecheck       TypeScript type-check"
	@echo ""
	@echo "Build"
	@echo "  pack            Build deployment tarball"
	@echo ""
	@echo "Publish"
	@echo "  publish-patch   Bump patch, build, publish, commit+tag"
	@echo "  publish-minor   Bump minor, build, publish, commit+tag"
	@echo "  publish-major   Bump major, build, publish, commit+tag"
	@echo ""
	@echo "Docker"
	@echo "  build-server    Build gralkor-server Docker image"
	@echo "  up              Start FalkorDB + Graphiti services"
	@echo "  down            Stop services"
	@echo "  logs            Tail Graphiti logs"
	@echo ""
	@echo "Setup"
	@echo "  setup-server    Create server venv and install Python deps (first time only)"

test: typecheck test-plugin test-functional test-server test-cli

test-plugin:
	pnpm exec vitest run

test-functional:
	pnpm exec vitest run --config test/functional/vitest.config.ts

test-server:
	cd server && uv run pytest tests/

test-cli:
	pnpm exec vitest run src/cli/

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

publish:
	pnpm run build
	pnpm publish --access public

version-major:
	pnpm version major --no-git-tag-version
	$(SYNC_RESOURCES)
	$(TAG_VERSION)

version-minor:
	pnpm version minor --no-git-tag-version
	$(SYNC_RESOURCES)
	$(TAG_VERSION)

version-patch:
	pnpm version patch --no-git-tag-version
	$(SYNC_RESOURCES)
	$(TAG_VERSION)

build-server:
	docker build -t gralkor-server:latest server/

up: build-server
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs graphiti
