# Candidate Communication Platform

A recruitment communication tool: recruiters manage candidates, send individual and bulk
messages through a (dummy) communication provider, track delivery status, retry failures,
and view each candidate's full communication history.

## Live

- Backend API: `https://candidate-platform-backend.onrender.com`
- API docs (Swagger): `https://candidate-platform-backend.onrender.com/docs`
- Health: `https://candidate-platform-backend.onrender.com/health`

## Structure

```
candidate/
├── readme.md        # this file
├── backend/         # FastAPI service (entry: main.py:app)
│   ├── main.py
│   ├── configs/db.py
│   ├── models/      # Candidate, Message, MessageStatusEvent, MessageTemplate
│   ├── schemas/     # Pydantic request/response
│   ├── routes/      # candidates, messages, templates, webhooks, provider
│   ├── services/messaging.py
│   └── providers/dummy_provider.py
└── frontend/        # Next.js 16 + React 19 UI
    ├── app/
    ├── components/candidates/  # workspace, table, dialogs, sheets
    └── lib/                    # api.ts, notify.ts, candidates.ts
```

## Backend — setup & run

Prerequisites: Python 3.11+, `uv` (recommended) or `pip` + `venv`, Windows
PowerShell or macOS/Linux terminal.

```powershell
cd backend

uv sync
.\.venv\Scripts\Activate.ps1

Copy-Item .env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<pass>@<ep-...>.neon.tech/<dbname>?sslmode=require
```

Pip alternative: `python -m venv .venv`, activate, `pip install -r requirements.txt`.

`configs/db.py` reads `DATABASE_URL`, normalizes it to `postgresql+psycopg://`, and
ensures `sslmode=require`. Tables are created on startup via `init_db()`.

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/docs` for Swagger, `/redoc` for ReDoc,
`/health` and `/health/db` for health checks.

## Frontend — setup & run

Prerequisites: Node 20+, npm.

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

The UI talks to the backend through `lib/api.ts`. The base URL defaults to the
deployed Render backend and can be overridden per environment:

```powershell
Copy-Item .env.example .env.local
# NEXT_PUBLIC_API_URL=https://candidate-platform-backend.onrender.com
```

## API reference

Interactive docs: `/docs`. All errors use `{"detail": "<human-friendly message>"}`.

| Method | Path | Description |
|---|---|---|
| POST | `/candidates` | Add candidate (name, phone, email) |
| GET | `/candidates?search=&limit=&offset=` | List + search candidates |
| GET | `/candidates/{id}` | Candidate details |
| PATCH | `/candidates/{id}` | Update candidate |
| DELETE | `/candidates/{id}` | Delete candidate |
| GET | `/candidates/{id}/messages?status=&limit=&offset=` | Communication history |
| POST | `/messages` | Send to one candidate (`candidate_id`, `body` or `template_id+variables`, optional `scheduled_for`) |
| POST | `/messages/bulk` | Send same message to many (`candidate_ids[]`, `body`); per-candidate results, one failure never blocks rest |
| GET | `/messages/{id}` | Message details + status |
| POST | `/messages/{id}/retry` | Retry failed message (only if `retryable`) |
| POST | `/messages/{id}/send-now` | Send a scheduled message immediately |
| POST | `/messages/process-due` | Send due scheduled messages |
| POST / GET | `/templates` | Create / list message templates (bonus) |
| POST | `/templates/{id}/send` | Send template to one or many (`candidate_id` or `candidate_ids`, `variables`); `{{name}}` auto-filled |
| POST | `/webhooks/provider` | Provider status update (`provider_message_id`, `status`); idempotent, replays return `duplicate:true` |
| GET | `/provider/health` | Provider operational flag + sent/delivered/failed/scheduled counts |
| POST | `/provider/simulate-down` | `{"down":true/false}` — simulate outage (bonus: provider health) |
| GET | `/health/db` | DB connectivity check |

Message `status`: `scheduled → sent → delivered → read`, or `failed`.
Webhook transitions are validated; replays are idempotent.

## Dummy provider simulation

`providers/dummy_provider.py` is a separate stand-in for a real provider
(Twilio/WhatsApp/Resend). Deterministic triggers for demo and tests:

- body `[temp]` or phone ends `9999` → temporary failure (retryable)
- body `[ratelimit]` or phone ends `0002` → rate limited (retryable)
- body `[fail]` or phone ends `0000` → delivery failure (permanent)
- body `[unavailable]` or phone ends `0001`, or `simulate-down` → service unavailable (retryable)
- phone `+000…` / `invalid` → invalid recipient (permanent)

## Features (per assignment)

- Candidates: add, list, server-side search, details, delete
- Single message send; bulk send with independent per-candidate tracking
- Status lifecycle with webhook updates (`sent → delivered → read`, `failed`), idempotent replays
- Human-friendly errors for invalid recipient, rate limits, temporary/permanent failures, provider outage
- Retry for retryable failures only; permanent failures clearly marked
- Per-candidate communication history with timestamps, status, and failure reasons
- Bonus: message templates, scheduled messages (`scheduled_for`, `send-now`, `process-due`), provider health dashboard + outage simulation
- Frontend UX: skeleton loaders, spinners on all pending actions, toasts for every action outcome, empty/loading/error states
