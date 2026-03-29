# openKMS — Docker images and Compose only.
# From repo root:
#   make -C docker build
#   make -C docker up
#   make -C docker down

DOCKER_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
COMPOSE := cd $(DOCKER_DIR) && docker compose -f docker-compose.yml

.PHONY: build up down docker-build docker-up docker-down

build docker-build:
	$(COMPOSE) build

up docker-up:
	$(COMPOSE) up -d --build

down docker-down:
	$(COMPOSE) down
