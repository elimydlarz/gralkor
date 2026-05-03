SHELL := /bin/sh
MAKEFLAGS += --no-print-directory
.PHONY: help up health clean

ifneq (,$(wildcard .env))
include .env
export
endif

HOST_PORT ?= 4000

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Start the gralkor server in the foreground (Ctrl-C to stop)
	@./serve.sh

health: ## Curl /health on the running server
	@curl -fsS "http://localhost:$(HOST_PORT)/health" && echo

clean: ## Remove the local data directory (DESTRUCTIVE — graph data lost)
	@printf 'Delete ./data ? [y/N] '; read ans; case "$$ans" in y|Y) rm -rf ./data; echo "data/ removed";; *) echo "aborted"; exit 1;; esac
