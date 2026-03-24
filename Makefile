.PHONY: test test-plugin test-server typecheck pack publish build-server up down logs setup-server \
        version-major version-minor version-patch help

SYNC_RESOURCES = node -e " \
  const fs = require('fs'); \
  const v = require('./package.json').version; \
  ['resources/memory/package.json'].forEach(f => { \
    const p = JSON.parse(fs.readFileSync(f)); \
    p.version = v; \
    fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n'); \
  });"

TAG_VERSION = \
  V=$$(node -p "require('./package.json').version"); \
  git commit --only package.json resources/memory/package.json -m "$$V"; \
  git tag "v$$V"

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Testing"
	@echo "  test            Run all tests (plugin + server)"
	@echo "  test-plugin     TypeScript tests only (vitest)"
	@echo "  test-server     Python server tests only (no Docker needed)"
	@echo "  typecheck       TypeScript type-check"
	@echo ""
	@echo "Build"
	@echo "  pack            Build deployment tarball"
	@echo ""
	@echo "Versioning"
	@echo "  version-patch   Bump patch version (x.y.Z)"
	@echo "  version-minor   Bump minor version (x.Y.z)"
	@echo "  version-major   Bump major version (X.y.z)"
	@echo ""
	@echo "Docker"
	@echo "  build-server    Build gralkor-server Docker image"
	@echo "  up              Start FalkorDB + Graphiti services"
	@echo "  down            Stop services"
	@echo "  logs            Tail Graphiti logs"
	@echo ""
	@echo "Setup"
	@echo "  setup-server    Create server venv and install Python deps (first time only)"

test: test-plugin test-server

test-plugin:
	pnpm exec vitest run

test-server:
	cd server && uv run pytest tests/

test-server-changed:
	@cd server && uv run pytest tests/ $$(git diff --name-only --diff-filter=d HEAD -- 'tests/*.py' 'main.py' | sed -n 's|^tests/|tests/|p')

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
