# Candidate Platform Backend

FastAPI backend (Python 3.11). Entry point: `main.py:app`.

## Prerequisites

- Python 3.11+
- `uv` (recommended) or `pip` + `venv`
- Windows PowerShell, macOS/Linux terminal

## Setup

```powershell
git clone <repo-url>
cd candidate-platform-backend

uv sync
.\.venv\Scripts\Activate.ps1

Copy-Item .env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<pass>@<ep-...>.neon.tech/<dbname>?sslmode=require
```

Pip alternative: `python -m venv .venv`, activate, `pip install -r requirements.txt`.

New dependency: `uv add <package>` then `uv pip freeze > requirements.txt`.

## Database (Neon Postgres)

`configs/db.py` reads `DATABASE_URL` from `.env`, normalizes it to `postgresql+psycopg://`, and ensures `sslmode=require`. Tables are created on startup via `init_db()`. Check `GET /health/db`.

```powershell
.\.venv\Scripts\python -c "from configs.db import check_connection; check_connection(); print('neon connect OK')"
```

## How to Run

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Open:

- API root: http://127.0.0.1:8000/
- Health check: http://127.0.0.1:8000/health
- Swagger docs: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

Expected responses:

```json
GET /        -> {"message": "Hello, FastAPI!"}
GET /health  -> {"status": "ok"}
```

## Project Structure

```
candidate-platform-backend/
├── main.py                  # FastAPI app + router wiring
├── configs/db.py            # Neon Postgres engine, SessionLocal, Base, get_db, init_db
├── models/                  # Candidate, Message, MessageStatusEvent, MessageTemplate
├── schemas/                 # Pydantic request/response (candidate, message, common)
├── routes/                  # candidates, messages, templates, webhooks, provider
├── services/messaging.py    # send / bulk / webhook / retry / scheduled logic
├── providers/dummy_provider.py  # Dummy comms provider (separate from app)
├── pyproject.toml
├── uv.lock
├── requirements.txt
├── .env                     # DATABASE_URL (not committed)
├── .env.example
└── .venv/
```

## API Reference

Docs: `/docs`. All error responses use `{"detail": "<human-friendly message>"}`.

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
| POST | `/templates` / GET `/templates` | Create / list message templates (bonus) |
| POST | `/templates/{id}/send` | Send template to one or many (`candidate_id` or `candidate_ids`, `variables`); `{{name}}` auto-filled |
| POST | `/webhooks/provider` | Provider status update (`provider_message_id`, `status`); idempotent replays return `duplicate:true` |
| GET | `/provider/health` | Provider operational flag + sent/delivered/failed/scheduled counts |
| POST | `/provider/simulate-down` | `{"down":true/false}` — simulate outage (bonus: provider health) |
| GET | `/health/db` | DB connectivity check |

Message `status`: `scheduled → sent → delivered → read`, or `failed`. Webhook transitions are validated; replays are idempotent.

Dummy provider simulation (deterministic, for demo/tests):
- body `[temp]` or phone ends `9999` → temporary failure (retryable)
- body `[ratelimit]` or phone ends `0002` → rate limited (retryable)
- body `[fail]` or phone ends `0000` → delivery failure (permanent)
- body `[unavailable]` or phone ends `0001` or simulate-down → service unavailable (retryable)
- phone `+000...` / `invalid` → invalid recipient (permanent)

## Troubleshooting

- Wrong pydantic version: activate `.venv` first.
- PowerShell blocks `Activate.ps1`: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`, then activate again.
