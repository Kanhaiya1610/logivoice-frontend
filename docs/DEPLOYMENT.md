# GitHub Pages deployment

The frontend deploys as a static Vite bundle through GitHub Pages. The backend remains an independent HTTPS service.

## 1. Repository settings

1. Create or use a repository named `logivoice-frontend`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_API_BASE_URL`: the public backend API base, for example `https://api.example.com/api/v1`.
   - `VITE_BASE_PATH`: `/logivoice-frontend/` for the project site. Use `/` for a custom domain.
4. Configure the backend CORS allowlist for the exact Pages origin, such as `https://<account>.github.io`, and for the local development origin when needed.

`VITE_API_BASE_URL` is public configuration, not a secret. Do not put backend credentials, AI provider keys, database URLs, or private tokens in GitHub variables used by this build.

## 2. Workflow

`.github/workflows/deploy.yml` runs on pushes to `main` and manually from the Actions tab. It:

1. Checks out this repository.
2. Installs Node.js 20 and dependencies with `npm ci`.
3. Runs `npm run lint` and `npm test`.
4. Builds with `npm run build`, using the configured API/base-path variables.
5. Uploads `dist/` using the official Pages artifact action.
6. Deploys the artifact using the official Pages deployment action.

The workflow fails before deployment if lint, tests, or the production build fail.

## 3. Local backend proxy

Without a local `VITE_API_BASE_URL`, the app uses `/api/v1`. Vite proxies `/api` to `http://localhost:5000` during `npm run dev`. This proxy only exists in development; GitHub Pages always uses the URL compiled into the build.

## 4. Backend prerequisites

The backend must provide the routes listed in the frontend [README](../README.md), support bearer authentication, and return CORS headers for the Pages origin. Uploads, extracted text, analytics, and chat must be handled server-side. GitHub Pages cannot run Python, OCR workers, or a database.

Before publishing, verify the deployed API's `/health` endpoint and then sign in through the Pages site. If the service is unavailable, the UI keeps its controls available and shows a retryable backend-unavailable state.

## 5. Manual verification

After the workflow succeeds:

1. Open the Pages URL and hard-refresh it on `#/documents`.
2. Sign in or register against the configured API.
3. Confirm the health indicator becomes **Backend connected**.
4. Upload a supported document and verify progress, processing status, extracted text, metadata, download, and delete behavior.
5. Confirm analytics and chat use current backend responses.
6. Test the text search path even if browser voice recognition is unavailable.
