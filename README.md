# Lattice

Graph-first wire harness planning for vehicle electrical systems.

## Stack

- **Frontend**: React, Vite, TypeScript, Tailwind, Zustand, TanStack Query, React Flow
- **Backend**: FastAPI, SQLAlchemy, Alembic, PostgreSQL

## Quick start

Requires **Docker Desktop** (for PostgreSQL), **Node.js**, and **Python 3.11+** (`python3` on macOS).

```bash
# One-time setup (starts DB, installs deps, runs migrations)
make setup

# Terminal 1 — API  →  http://localhost:8000/docs
make api

# Terminal 2 — UI   →  http://localhost:5173
make fe
```

Or step by step:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
make up          # must succeed before db-migrate
make install     # uses python3 (not python)
make db-migrate
```

If `make install` failed earlier with `python: command not found`, pull latest Makefile and run `make install` again.

## Production (single server)

The API serves the built React UI from `frontend/dist` when that folder exists. One process handles both REST/WebSocket API and static assets.

```bash
# Configure backend (copy and edit if needed)
cp backend/.env.example backend/.env

# Database must be running and migrated
make up
make db-migrate

# Build UI + start API (no hot reload)
make prod
```

Open **http://localhost:8000** for the app. API docs remain at **http://localhost:8000/docs**.

Useful environment variables in `backend/.env`:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `CORS_ORIGINS` | Allowed browser origins (comma-separated); include your public URL if UI and API are on different hosts |
| `SERVE_STATIC_UI` | Set `false` to disable static UI mounting (API-only mode) |
| `STATIC_UI_DIR` | Optional override path to a Vite `dist` folder |

Build only the frontend:

```bash
make fe-build
```

Run the API against an existing build (development-style reload optional):

```bash
make fe-build
make api
```

## GitHub Pages (frontend only)

Workflow **Deploy frontend to GitHub Pages** (`.github/workflows/deploy-gh-pages.yml`) builds the UI from the checked-out branch and pushes `frontend/dist` to the `gh-pages` branch. Trigger it manually from the repository **Actions** tab.

After the first deploy, enable **Settings → Pages → Deploy from branch → `gh-pages` / root**.

The build uses `VITE_BASE_PATH=/<repo-name>/` for project pages (`https://<org>.github.io/<repo>/`). It still calls `/api/v1` on the same host, so GitHub Pages hosting alone will not reach a backend unless you proxy API traffic separately or point `VITE_API_BASE_URL` at a live API URL in the workflow.

## API layout


| Area              | Path                                                  | Purpose                                                             |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Catalog           | `/connector-templates`                                | Global mating-pair connectors (unified pinout, M/F part # & images) |
| Vehicle templates | `/vehicles/{id}/pcb-templates`, `enclosure-templates` | Per-vehicle definitions                                             |
| Instances         | `/vehicles/{id}/revisions/{rev}/instances/...`        | Enclosures, PCBs, connectors                                        |
| **Nets**          | `/vehicles/{id}/revisions/{rev}/nets/...`             | Logical nets, pin pairing, pin list                                 |
| **Topology**      | `/vehicles/{id}/revisions/{rev}/topology/...`         | Physical wires (edges) + summary counts                             |
| Shorts            | `.../instances/connectors/{id}/shorts`                | Intra-connector pin bonds                                           |
| Graph             | `.../graph/trace`, `.../graph/impact-analysis`        | Traversal & delete preview                                          |
| Manufacturing     | `.../manufacturing/...`                               | Harness groups & build records                                      |
| Revisions         | `.../revisions/{rev}/publish`                         | Immutable snapshot + draft clone                                    |


## Design workflow

1. Sign in → create vehicle
2. **Design** quick setup: connector template → PCB/enclosure templates → instances
3. **Wire**: pair pins (auto net name `Origin.Pin -> Dest.Pin`) or assign via **Nets**
4. **Pin shorts** on a connector for internal continuity (e.g. CAN-H ↔ CAN-H)
5. **Manufacturing**: sync harness groups → track builds
6. **Publish** revision when ready

## Net naming

- **User-named**: explicit names (e.g. `CAN1_H`) via Net manager or “New net” when wiring
- **Auto-named**: `ECU1.CAN_H -> Panel1.CAN_H` for wire pairs; `Connector.Pin` for shorts / lone pins after delete

## Project layout

```
backend/app/domains/     graph, validation, net naming, pin shorts
backend/app/services/    application logic
frontend/src/features/   design, nets, manufacturing
```

