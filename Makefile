.PHONY: test test-plugin test-server typecheck up down logs setup-server

test: test-plugin test-server

test-plugin:
	pnpm exec vitest run

test-server:
	cd server && .venv/bin/python -m pytest tests/ -v

typecheck:
	pnpm exec tsc --noEmit

setup-server:
	cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs graphiti
