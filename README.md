# LogiVoice Frontend

The independent React/Vite frontend for LogiVoice, a logistics document intelligence workspace. The application is a static build that talks to a separately deployed versioned backend API.

## Implemented MVP flow

- Token-backed login and registration screens.
- PDF, PNG, JPG/JPEG, and TXT upload with extension, size (25 MB default), queue, progress, and error feedback.
- Real document listing with backend search, processing-status filters, pagination, and polling while records are processing.
- Document details with processing status, extracted text, metadata, authenticated download, and delete actions.
- Backend-provided analytics from `GET /analytics/overview`.
- Document-grounded chat through `POST /chat`.
- Browser SpeechRecognition voice search when available, with a visible text search field as the fallback.
- Loading, empty, error, and unavailable-backend states throughout the workspace.

The UI does not ship document or analytics fixtures. Values displayed in the workspace come from the configured API.

## Local development

Supported runtime: Node.js 20 or newer.

```bash
npm ci
copy .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev
```

By default, the frontend uses `VITE_API_BASE_URL=/api/v1` and `VITE_BASE_PATH=/`. Vite proxies `/api` to `http://localhost:5000`, so a local backend listening on port 5000 can be used without a browser CORS setup. Set `VITE_API_BASE_URL` to a different API origin when needed.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Versioned backend API base. Use the HTTPS backend URL in a deployed build. |
| `VITE_BASE_PATH` | `/` | Vite asset base. Use `/logivoice-frontend/` for the project GitHub Pages site. |

Values prefixed with `VITE_` are compiled into a public browser bundle. Never put API keys, database credentials, or private tokens in these variables.

## API contract used by the frontend

The backend should expose these versioned routes relative to `VITE_API_BASE_URL`:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend availability check |
| `POST` | `/auth/register` | Create an account and return a token |
| `POST` | `/auth/login` | Authenticate and return a token |
| `POST` | `/auth/logout` | End the current token session |
| `GET` | `/auth/me` | Return the current authenticated user |
| `POST` | `/documents` | Upload one or more `files` multipart fields |
| `GET` | `/documents` | Search/list with `q`, `status`, `page`, and `per_page` |
| `GET` | `/documents/{id}` | Return document detail, text, metadata, and status |
| `POST` | `/documents/{id}/reprocess` | Re-run extraction for an owned source record |
| `DELETE` | `/documents/{id}` | Delete an owned document |
| `GET` | `/documents/{id}/download` | Download an owned source file |
| `GET` | `/analytics/overview` | Return data-driven document analytics |
| `POST` | `/chat` | Answer `{ "document_id": "…", "question": "…" }` using that document |

The client accepts either a direct payload or an envelope containing `data`. It sends `Authorization: Bearer <token>` for authenticated calls and turns transport/API failures into a normalized `ApiError`.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

The API client test suite uses Node's built-in test runner and does not require a browser or backend server.

## GitHub Pages

This repository is designed for a project Pages site at:

`https://<account>.github.io/logivoice-frontend/`

Set the repository variables `VITE_API_BASE_URL` and `VITE_BASE_PATH` before running the deployment workflow. For a normal project repository, `VITE_BASE_PATH` is `/logivoice-frontend/`. The app uses hash navigation (`#/documents`, `#/document/<id>`) so refreshing a Pages URL does not request a server-side route that GitHub Pages cannot provide.

For the deployed backend, set the **repository variable** `VITE_API_BASE_URL` to
`https://logivoice-backend.onrender.com/api/v1` under **Settings → Secrets and variables
→ Actions → Variables**. Use the Variables tab, not Secrets. The `/api/v1` prefix is
required. Trigger a new Pages workflow after changing build-time variables.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete workflow and backend CORS requirements.
