# TeamFlow — Project Management Workspace

TeamFlow is a focused project and task management app for a small company. It gives Admins, Managers, and Employees one place to coordinate projects, assign work, move tasks through a Kanban board, and discuss task details.

This is a portfolio project built with a deliberately small architecture. It uses a modular FastAPI backend and a React frontend. It is not a multi-tenant SaaS or an audited enterprise product.

## What it includes

- Admin, Manager, and Employee roles with server-side permission checks.
- Admin-managed team accounts; there is no public self-registration route.
- Project creation, team membership, due dates, and project progress.
- Task assignment, priorities, due dates, and four task states.
- Kanban board with drag-and-drop on desktop; task status can also be changed from task details.
- Task comments and a small activity feed.
- Dashboard counts, search, and a personal task list.
- Light and dark themes saved in the current browser.
- PostgreSQL, SQLAlchemy, Alembic migrations, and a small API test suite.

## Stack

- Frontend: React, TypeScript, Vite, CSS, Lucide icons
- Backend: Python, FastAPI, Pydantic, SQLAlchemy
- Database: PostgreSQL
- Authentication: Argon2 password hashing and signed JWT access tokens
- Development: Docker Compose (database only), Pytest

The backend uses synchronous SQLAlchemy sessions with normal FastAPI `def` route handlers. FastAPI runs synchronous handlers in its worker thread pool; this keeps database calls from blocking the event loop while keeping the data layer straightforward.

## Roles and permissions

| Action | Admin | Manager | Employee |
|---|---|---|---|
| View all projects | Yes | No | No |
| View a project | Any project | Created projects and projects they belong to | Projects they belong to |
| Create a project | Yes | Yes | No |
| Edit/delete a project | Any project | Projects they created | No |
| Add team accounts | Yes | No | No |
| Create/assign tasks | Any project | Projects they created | No |
| Change task details | Any project | Projects they created | No |
| Change task status | Any task | Projects they created | Only tasks assigned to them |
| Comment on visible project tasks | Yes | Yes | Yes |

Project and task permissions are checked by the API. Hiding a button in the frontend is not treated as authorization.

## Run locally (Windows PowerShell)

### 1. Requirements

Install:

- Python 3.11 or newer
- Node.js 20 or newer (Node 22 is a good choice)
- Docker Desktop, or a local PostgreSQL 16+ server

### 2. Configure the environment

From the project root:

```powershell
Copy-Item .env.example .env
```

Open `.env` and change `SECRET_KEY` and `ADMIN_PASSWORD`. Use a long, unique secret for `SECRET_KEY` (for example, generate one with `python -c "import secrets; print(secrets.token_hex(32))"`). Do not commit `.env`.

The example database URL matches the PostgreSQL service in `docker-compose.yml`.

### 3. Start PostgreSQL

From the project root:

```powershell
docker compose up -d db
```

Wait until the database health check reports healthy.

### 4. Install and start the backend

```powershell
Set-Location backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
alembic upgrade head
python -m app.seed_admin
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`. Interactive API docs are at `http://localhost:8000/docs`; health check: `http://localhost:8000/health`.

`python -m app.seed_admin` reads `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from the root `.env`. It creates the first Admin. There is intentionally no public Admin registration endpoint.

### 5. Install and start the frontend

Open a second PowerShell terminal from the project root:

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:5173`.

Sign in using the Admin email and password you put in the root `.env`. The Admin can create Manager and Employee accounts from the Team page. Add team members to a project before assigning them tasks.

### macOS / Linux quick start

The same flow works with `python3 -m venv .venv`, `source .venv/bin/activate`, `cp .env.example .env`, and `cp frontend/.env.example frontend/.env.local`.

## Run tests

From the `backend` directory with the virtual environment activated:

```powershell
python -m pytest -q
```

The tests use an isolated in-memory SQLite database, so they do not need a running PostgreSQL server.

## Database changes

The initial schema is managed with Alembic:

```powershell
alembic upgrade head
```

After changing SQLAlchemy models, create a new migration from the `backend` directory:

```powershell
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Review generated migrations before applying them. The initial migration creates the current model metadata; later migrations should be reviewed and committed with the model changes.

## Performance choices

- Keep the app as a modular monolith; avoid network hops between microservices.
- Add database indexes to fields used for lookups, filtering, and task ordering.
- Load related project members and task assignees in batches with SQLAlchemy `selectinload`.
- Aggregate dashboard task counts in one grouped query instead of issuing a query per task.
- Limit the task list response to 300 records for this small-team version.
- Keep the frontend dependency list small and avoid a large component framework or charting library.

For a small team, these choices are a sensible starting point. Actual latency depends on the database host, network, data volume, and deployment setup; no code can guarantee zero delay in every environment.

## Important production hardening before real company use

This repository is a portfolio-ready MVP, not a security-audited production service. Before exposing it to the public internet:

- Serve it only over HTTPS and set a strong secret in the hosting environment.
- Move browser authentication from `sessionStorage` to Secure, HttpOnly cookies with an appropriate CSRF strategy and add refresh-session rotation/revocation.
- Add login rate limiting, password reset and account recovery, email verification, and an account deactivation workflow.
- Configure production CORS origins, database backups, monitoring, and log retention.
- Add a file-storage service only when the product needs task attachments.

Current access tokens expire after the configured `ACCESS_TOKEN_MINUTES`. The frontend keeps the token in `sessionStorage`, so it is cleared when the browser tab session ends; this is simpler for the portfolio version, but it is not the recommended final design for a public production deployment.

## Useful API routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Sign in |
| GET | `/api/v1/auth/me` | Current user |
| GET / POST | `/api/v1/users` | List users / create a team account (Admin creates) |
| GET / POST | `/api/v1/projects` | List / create projects |
| GET / PATCH / DELETE | `/api/v1/projects/{id}` | Read / edit / delete a project |
| GET / POST | `/api/v1/tasks` | List / create tasks |
| PATCH / DELETE | `/api/v1/tasks/{id}` | Update / delete a task |
| GET / POST | `/api/v1/tasks/{id}/comments` | Read / add comments |
| GET | `/api/v1/dashboard/summary` | Dashboard counts and activity |

## Project structure

```text
project-management-saas/
├── backend/
│   ├── app/
│   │   ├── api/             # Authentication, workspace, dashboard routes
│   │   ├── config.py        # Environment configuration
│   │   ├── database.py      # SQLAlchemy engine and sessions
│   │   ├── dependencies.py  # Authentication and role checks
│   │   ├── models.py        # Database models
│   │   ├── schemas.py       # Request and response validation
│   │   ├── security.py      # Password hashing and JWTs
│   │   └── seed_admin.py    # Create the first Admin
│   ├── alembic/             # Database migration
│   ├── tests/               # API permission and workflow tests
│   └── requirements.txt
├── frontend/
│   └── src/                 # React app, API client, types, styles
├── docker-compose.yml       # Local PostgreSQL service
├── .env.example
└── README.md
```
