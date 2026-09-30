# Production Readiness

## Environment

Configure the backend with environment variables. Do not commit `.env` files or production secrets.

Required backend variables:

- `NODE_ENV=production`
- `PORT` (the platform-provided port, when applicable)
- `FRONTEND_URL` (one or more comma-separated trusted origins)
- `MONGODB_URI`
- `JWT_SECRET` (a long, randomly generated secret stored in the deployment secret manager)
- `TEST_MODE=false`

The backend fails startup when production database or JWT configuration is missing, and refuses to run with `TEST_MODE=true` in production.

`VITE_BACKEND_URL` is optional at build time. When omitted, frontend API calls use same-origin `/api` paths; this is useful for local development or deployments that proxy the API on the same origin. With the documented separate Vercel frontend and backend projects, set `VITE_BACKEND_URL` to the deployed backend's HTTPS origin before building. Without that setting, Vercel can serve the frontend, but backend-dependent features will not work until an API is available at the same origin. Do not use localhost for Preview or Production, and do not put private credentials in Vite variables because they are public in the browser bundle. Task share links use the current browser origin.

## Build and start

```text
cd frontend && npm ci && npm run build
cd backend && npm ci && npm start
```

Run the backend behind HTTPS termination and configure the deployment health check as `GET /api/health/ready`. `GET /api/health/live` is a liveness-only probe.

## Storage

For local `TEST_MODE=true`, uploaded documents are stored under the backend `uploads/` directory. With `TEST_MODE=false`, uploads are stored in MongoDB GridFS through the configured `MONGODB_URI`; authenticated downloads use the stored object ID. This works across Vercel function instances and persists with the database. Production upload size is capped at 4 MB to fit under Vercel Functions' 4.5 MB request payload limit. Back up GridFS files and metadata together.

The Event and PI-conversion flows use MongoDB transactions. Production MongoDB must support transactions (a replica set or sharded cluster); a standalone MongoDB server is not sufficient.

The included `backend/vercel.json` configures a Vercel Function when the backend project root is set to `backend/`. The included `frontend/vercel.json` serves the Vite build and rewrites client-side routes to `index.html`. Deploy these as two Vercel projects: backend root `backend/`, frontend root `frontend/`. Add the frontend's exact deployed origin to backend `FRONTEND_URL`, and set the frontend's `VITE_BACKEND_URL` to the backend's HTTPS origin. Redeploy after changing environment variables.

Vercel project environment variables:

- Frontend (Production and Preview): `VITE_BACKEND_URL=https://<deployed-backend-origin>`
- Backend (Production): `NODE_ENV=production`, `TEST_MODE=false`, `MONGODB_URI=<managed MongoDB replica-set URI>`, `JWT_SECRET=<random secret of at least 32 characters>`, `FRONTEND_URL=https://<deployed-frontend-origin>`, `PORT` supplied by Vercel
- Backend (Preview): set a separate database and secret where possible; set `FRONTEND_URL` to the exact preview frontend origin. Vercel preview hostnames are dynamic, so use a stable preview domain or list every allowed origin explicitly.

Do not set any `VITE_*` secret. Production MongoDB must support transactions (a replica set or sharded cluster).

## Backups

Use the MongoDB provider's managed backup or `mongodump` in a scheduled job outside the application process. Recommended starting policy:

- daily backups with point-in-time recovery where the provider supports it
- at least 30 days of retention
- one encrypted restore test per quarter
- document the restore owner, target environment, and expected recovery point/objectives

Back up uploaded documents separately from MongoDB records. Test that document metadata and file objects restore together. Do not run destructive backup or restore commands from application startup.

## Security and operations

The API uses configured-origin CORS, Helmet security headers, request IDs, bounded JSON bodies, authentication and analytics rate limits, JWT algorithm/expiry checks, authenticated document access, and safe production error responses. Authentication and authorization still need deployment-level monitoring and alerting.

Rotate `JWT_SECRET` and any database credentials through the deployment secret manager. Do not log passwords, tokens, secrets, or private document contents. Review the structured request logs for request ID, route, status, and duration only.

## Release checks

- `cd backend && npm test`
- `cd backend && npm audit --omit=dev --audit-level=high`
- `cd frontend && npm run build`
- start the backend with production variables and verify `/api/health/ready`
- verify CORS from the configured frontend origin
- verify authenticated document upload/download and cross-user access denial
- verify MongoDB and upload backups can be restored

The current automated suite contains the analytics regression. HTTP-level authorization, upload, lifecycle, and MongoDB integration tests should be added before a high-risk production release.
