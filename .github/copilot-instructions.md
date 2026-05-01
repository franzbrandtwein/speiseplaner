# Copilot Instructions — Kochplaner / Speiseplaner

## Architecture Overview

Full-stack meal planning app with a **React SPA frontend** and a **FastAPI backend** backed by **MongoDB**.

```
speiseplaner/
├── backend/          # FastAPI app (Python, port 8001)
│   ├── server.py     # Entrypoint — mounts all routers
│   ├── core.py       # Shared infrastructure: DB client, auth helpers, file storage, email, push
│   ├── models.py     # All Pydantic models (single source of truth for data shapes)
│   └── routes/       # One file per feature domain (auth, recipes, mealplans, shopping, groups, notifications, admin)
└── frontend/         # React 19 + Tailwind + shadcn/ui (port 3000)
    └── src/
        ├── App.js    # Router, AuthContext, API base URL logic
        ├── pages/    # Full-page route components
        ├── components/ # Shared UI components (Layout, dialogs, shadcn/ui wrappers in components/ui/)
        ├── hooks/    # Custom React hooks
        └── lib/utils.js  # cn() Tailwind class merge helper
```

**Data flow**: All API calls go through the `API` constant exported from `App.js`. The backend always stores `datetime` fields as ISO strings in MongoDB (convert with `.isoformat()` on write, `datetime.fromisoformat()` on read). MongoDB documents always exclude `_id` with `{"_id": 0}` projections.

**Auth**: Session-cookie based. `get_current_user` in `core.py` is the FastAPI dependency for protected routes. Do **not** hardcode redirect URLs in the auth flow — see the comment in `App.js`.

## Running the Project

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
Or use the helper script: `./start_backend.sh`

### Frontend
```bash
cd frontend
yarn start        # dev server on port 3000
yarn build        # production build
```

### Both together (systemd)
```bash
./start.sh        # starts kochplaner-backend + kochplaner-frontend systemd services
./stop.sh
./restart.sh
```

### Backend tests
```bash
# Run the full API test suite (requires backend to be running):
python backend_test.py

# Run a focused test file:
python side_dishes_test.py
```

## Key Conventions

### Backend
- Every route file has a module-level docstring describing what it contains.
- All routers use `prefix="/api"`.
- IDs are generated with `f"<type>_{uuid.uuid4().hex[:12]}"` (e.g. `recipe_abc123def456`).
- Recipe `difficulty` values: `"leicht"`, `"mittel"`, `"schwer"` (German).
- Recipe `category` default: `"Hauptgericht"`. Other values: `"Frühstück"`, `"Suppe"`, etc.
- Group-scoped queries: check `user.group_id`, fetch group members, then query with `$or` for own + shared-with-group content.
- Image uploads land in `UPLOAD_DIR` (default `/var/speiseplaner_bilder`; see `backend/.env` for local override). Always call `_safe_path()` before any file operation.
- LLM-based recipe import uses `EMERGENT_LLM_KEY` env var (optional feature).

### Frontend
- `REACT_APP_BACKEND_URL` (in `frontend/.env`) sets the API base. The `BACKEND_URL` logic in `App.js` auto-detects reverse proxy setups — **do not add hardcoded fallbacks there**.
- Path alias `@` maps to `src/` (configured in craco).
- UI components come from **shadcn/ui** (Radix UI primitives + Tailwind) — add new components via shadcn CLI, not by hand.
- Toast notifications use **Sonner** (`toast.success(...)`, `toast.error(...)`).
- All user-facing text is in **German**.

### Design System (`design_guidelines.json`)
- Primary color: `#10B981` (Fresh Basil / emerald-500)
- Secondary color: `#F59E0B` (Zest Orange / amber-400) — used for stars/ratings
- Headings: `Playfair Display, serif`; Body: `Inter, sans-serif`; Monospace data: `JetBrains Mono`
- Avoid teal/purple CTAs, centered layouts, gradient overloads — prefer asymmetry and texture.

## Environment Variables

### `backend/.env`
| Variable | Default | Notes |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` | |
| `DB_NAME` | `kochplaner` | |
| `SECRET_KEY` | *(change in prod)* | Used for session signing |
| `UPLOAD_DIR` | `/tmp/kochplaner_uploads` | Local override for image storage |
| `FRONTEND_URL` | `http://localhost:3000` | Used for CORS / invite links |
| `EMERGENT_LLM_KEY` | *(optional)* | Enables LLM recipe import from URLs |

### `frontend/.env`
| Variable | Example |
|---|---|
| `REACT_APP_BACKEND_URL` | `http://localhost:8001` |
| `HOST` | `0.0.0.0` |
