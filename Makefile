# openKMS Makefile - common development tasks

.PHONY: install migrate run-backend run-frontend run-worker test docker-up docker-down

# Install dependencies
install:
	cd backend && uv sync
	cd frontend && npm install

# Run database migrations (requires backend/.env with DB credentials)
migrate:
	cd backend && alembic upgrade head

# Run backend (port 8102)
run-backend:
	cd backend && uvicorn app.main:app --reload --port 8102

# Run frontend dev server (port 5173)
run-frontend:
	cd frontend && npm run dev

# Run procrastinate worker
run-worker:
	cd backend && python worker.py

# Run tests
test:
	cd backend && uv run pytest -q
	cd frontend && npm run test

# Docker Compose
docker-up:
	docker compose up -d

docker-down:
	docker compose down
