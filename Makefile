.PHONY: test test-plugin test-server typecheck pack up down logs setup-server \
        version/major version/minor version/patch

test: test-plugin test-server

test-plugin:
	pnpm exec vitest run

test-server:
	cd server && .venv/bin/python -m pytest tests/ -v

typecheck:
	pnpm exec tsc --noEmit

setup-server:
	cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

pack:
	bash scripts/pack.sh

version/%:
	npm version $* --no-git-tag-version
	node -e " \
	  const fs = require('fs'); \
	  const v = require('./package.json').version; \
	  ['resources/memory/package.json', 'resources/tool/package.json'].forEach(f => { \
	    const p = JSON.parse(fs.readFileSync(f)); \
	    p.version = v; \
	    fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n'); \
	  });"

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs graphiti
