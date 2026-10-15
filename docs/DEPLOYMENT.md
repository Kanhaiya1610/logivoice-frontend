# GitHub Pages deployment

The frontend deploys as a static Vite bundle through GitHub Pages. The backend remains an independent HTTPS service.

## 1. Repository settings

1. Create or use a repository named `logivoice-frontend`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables → Repository variables**,
   select **New repository variable** and add:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://logivoice-backend.onrender.com/api/v1`
   - Select **Add variable**. Do not include quotes or `VITE_API_BASE_URL=` in the value.
4. Add another repository variable:
   - `VITE_BASE_PATH`: `/logivoice-frontend/` for the project site. Use `/` for a custom domain.
5. Configure the backend CORS allowlist for the exact Pages origin,
   `https://kanhaiya1610.github.io` for the current repository owner (not the repository path),
   and for the local development origin when needed.

`VITE_API_BASE_URL` is public configuration, not a secret. Do not put backend credentials, AI provider keys, database URLs, or private tokens in GitHub variables used by this build.

Use **Repository variables**, not the **Secrets** tab or an environment-only variable:
the build job reads `vars.VITE_API_BASE_URL` and does not run in the `github-pages`
environment. Only the deploy job uses that environment. A secret with the same name
does not populate `vars.VITE_API_BASE_URL`.

The `/api/v1` suffix is required: the client appends routes such as `/auth/login` and
`/documents`. Using only `https://logivoice-backend.onrender.com/` would send requests
to the wrong routes. Health is available at
`https://logivoice-backend.onrender.com/api/v1/health`.

## 2. Workflow

`.github/workflows/deploy.yml` runs on pushes to `main` and manually from the Actions tab. It:

1. Checks out this repository.
2. Installs Node.js 20 and dependencies with `npm ci`.
3. Runs `npm run lint` and `npm test`.
4. Builds with `npm run build`, using the configured API/base-path variables.
5. Uploads `dist/` using the official Pages artifact action.
6. Deploys the artifact using the official Pages deployment action.

The build job maps repository variables once for both validation and the Vite build:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
      VITE_BASE_PATH: ${{ vars.VITE_BASE_PATH || '/logivoice-frontend/' }}
```

The client reads `import.meta.env.VITE_API_BASE_URL`. Vite embeds that build-time value
in the public production JavaScript. Updating a repository variable does not update an
already published bundle; trigger a new workflow from **Actions → Deploy frontend to
GitHub Pages → Run workflow → main → Run workflow** after saving it.

The workflow fails before deployment if lint, tests, API configuration, or the production build fail.

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
