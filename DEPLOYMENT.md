# Deploying CodeSync — choose your guide

| Frontend host | Guide |
|---------------|-------|
| **Vercel**    | ➡️ **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)** |
| **Netlify**   | ➡️ **[DEPLOY-NETLIFY.md](DEPLOY-NETLIFY.md)** |
| No Vercel/Netlify — everything on one server | [Option C below](#option-c-everything-on-one-vm) |

Each guide is complete on its own (database, backend server, frontend, connecting,
troubleshooting, security) — you only need to read one.

## Why two parts?

Vercel and Netlify host **only the React frontend**. The backend needs long-lived
**WebSockets** (live sync and live output) and **Docker** (to run code), which they don't
provide, so it runs on a Linux VM:

| Part     | Where | Key setting |
|----------|-------|-------------|
| Frontend | Vercel or Netlify | `VITE_BACKEND_URL=https://api.yourdomain.com` (build time) |
| Backend  | Ubuntu VM + Docker + Caddy (HTTPS) + systemd | `CLIENT_ORIGIN=https://<your-frontend-domain>` |
| Database | MongoDB Atlas (free M0) | `MONGO_URI=mongodb+srv://…` |

### Vercel vs Netlify for this project

|                         | Vercel | Netlify |
|-------------------------|--------|---------|
| Config file             | `client/vercel.json` | `netlify.toml` (repo root) |
| Where to point it       | Root Directory = `client` (set in the dashboard) | nothing — `base = "client"` is in `netlify.toml` |
| Preview URL wildcard for `CLIENT_ORIGIN` | `https://codesync-*.vercel.app` | `https://*--codesync.netlify.app` |
| Rebuild after changing `VITE_BACKEND_URL` | Deployments → ⋯ → Redeploy | Trigger deploy → Clear cache and deploy site |
| Password-protect the site | Deployment Protection | Visitor access (paid plans) |

Both work equally well here — the frontend is just static files.

---

## Option C: everything on one VM

One server, one domain, no Vercel/Netlify, no cross-origin setup:

1. Follow **steps ① and 2.1 – 2.7** of either guide (Atlas + backend VM).
2. Build the frontend on the VM (leave `VITE_BACKEND_URL` empty — Express serves
   `client/dist` itself):
   ```bash
   cd /opt/codesync/client
   sudo -u codesync npm ci && sudo -u codesync npm run build
   sudo systemctl restart codesync
   ```
3. Use `deploy/Caddyfile` with your main domain (e.g. `codesync.yourdomain.com`) instead of
   `api.yourdomain.com`, then `sudo systemctl reload caddy`.
4. Open `https://codesync.yourdomain.com`. `CLIENT_ORIGIN` can stay at its default:
   same-origin requests are always allowed.
