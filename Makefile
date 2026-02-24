.PHONY: test test-plugin test-server typecheck up down logs

test: test-plugin test-server

test-plugin:
	npx vitest run

test-server:
	cd server && pytest tests/ -v

typecheck:
	npx tsc --noEmit

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs graphiti
