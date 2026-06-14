PYTHON ?= python3

.PHONY: up down install db-migrate db-revision api fe fe-build prod setup

# Full first-time setup: env files, postgres, deps, migrations
setup:
	cp -n .env.example .env 2>/dev/null || true
	cp -n backend/.env.example backend/.env 2>/dev/null || true
	cp -n frontend/.env.example frontend/.env 2>/dev/null || true
	$(MAKE) up
	$(MAKE) install
	$(MAKE) db-migrate

up:
	docker compose up -d db
	@echo "Waiting for PostgreSQL..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose exec -T db pg_isready -U lattice >/dev/null 2>&1 && break; \
		sleep 1; \
	done

down:
	docker compose down

install:
	cd backend && $(PYTHON) -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

db-migrate:
	cd backend && . .venv/bin/activate && alembic upgrade head

db-revision:
	cd backend && . .venv/bin/activate && alembic revision --autogenerate -m "$(msg)"

api:
	cd backend && . .venv/bin/activate && PYTHONPATH=. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

fe:
	cd frontend && npm run dev --host

fe-build:
	cd frontend && npm ci && npm run build

prod: fe-build
	cd backend && . .venv/bin/activate && PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000
