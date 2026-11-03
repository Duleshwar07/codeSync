# Deploying CodeSync with **Vercel** (frontend) + a VM (backend)

> Using Netlify instead? See **[DEPLOY-NETLIFY.md](DEPLOY-NETLIFY.md)**.
> Overview of all options: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## What goes where (read first)

Vercel hosts **static sites and short-lived serverless functions**. CodeSync's backend needs
three things Vercel cannot provide:

| The backend needs…                                                   | Vercel |
|----------------------------------------------------------------------|--------|
| Long-lived **WebSockets** (`/yjs` live sync, `/events` live output)   | ❌ functions end after each request |
| **Docker** to run user code                                          | ❌ no Docker daemon |
| An always-on process holding rooms in memory                         | ❌ stateless functions |

So the deployment is **split**:

```
  Browser ──HTTPS──▶  Vercel  (React frontend: static files only)
     │
     ├──HTTPS /api──────┐
     └──WSS /yjs /events┤
                        ▼
              api.yourdomain.com  (Linux VM)
              ┌───────────────────────────────┐
              │ Caddy  (HTTPS + WebSockets)   │
              │   └─▶ Node server :4000       │──▶ MongoDB Atlas (free tier)
              │         └─▶ Docker sandboxes  │
              └───────────────────────────────┘
```

| Part      | Where                                   | Cost (approx.)                  |
|-----------|-----------------------------------------|---------------------------------|
| Frontend  | **Vercel**                              | free (Hobby)                    |
| Backend   | Ubuntu VM (DigitalOcean, AWS EC2, Hetzner, Azure, GCP…) | ~$12–24/month for 2 vCPU / 4 GB |
| Database  | MongoDB Atlas                           | free (M0)                       |

The browser talks to the backend **directly** (Vercel can't proxy WebSockets):
- the frontend learns the backend's address from **`VITE_BACKEND_URL`** (baked in at build time);
- the backend only accepts browsers from the origins in **`CLIENT_ORIGIN`**.

### Files in the repo used by this guide

| File                       | Purpose |
|----------------------------|---------|
| `client/vercel.json`       | Vercel build settings (`npm run build` → `dist`) + SPA rewrite so `/room/<id>` links work |
| `client/.env.example`      | documents `VITE_BACKEND_URL` |
| `server/.env.example`      | documents `CLIENT_ORIGIN` (comma list, `*` wildcards), `MONGO_URI`, limits |
| `deploy/Caddyfile`         | HTTPS reverse proxy for the backend |
| `deploy/codesync.service`  | systemd unit that keeps the backend running |

Order of work: **① MongoDB → ② backend VM → ③ Vercel → ④ connect them.**

---

## ① MongoDB Atlas (database)

1. Sign up at https://www.mongodb.com/cloud/atlas → **Create** a free **M0** cluster
   (pick a region close to your VM).
2. **Database Access** → *Add New Database User* → username + strong password
   (role: *Read and write to any database*).
3. **Network Access** → *Add IP Address* → your VM's **public IP** (add it after step 2.1;
   `0.0.0.0/0` works but is less secure).
4. **Connect** → *Drivers* → copy the connection string and add the database name `codesync`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/codesync?retryWrites=true&w=majority
   ```
   (URL-encode special characters in the password, e.g. `@` → `%40`.)

---

## ② Backend on a Linux VM

### 2.1 Create the VM

- **Ubuntu 22.04 or 24.04**, at least **2 vCPU, 4 GB RAM, 40 GB disk** (the 7 sandbox images
  are ~2.8 GB; Java/Go/Rust compile with 256 MB each).
- Firewall / security group: allow **22** (SSH), **80** and **443** (HTTP/HTTPS).
  Do **not** open 4000 — Caddy fronts it.

### 2.2 Give it a domain name (needed for HTTPS)

Vercel serves your site over HTTPS, and browsers on an HTTPS page may only connect to an
**HTTPS/WSS** backend.

- **Own domain:** add a DNS **A record** `api.yourdomain.com → <VM public IP>`.
- **No domain:** use the free wildcard DNS service sslip.io, e.g.
  `api.203-0-113-10.sslip.io` (your IP with dots → dashes). Caddy can get a certificate for it.

Below, `api.yourdomain.com` means whichever name you chose.

### 2.3 Install Docker, Node.js 20, Caddy, git

SSH into the VM, then:

```bash
sudo apt update && sudo apt -y upgrade

# Docker Engine
curl -fsSL https://get.docker.com | sudo sh

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Caddy (automatic HTTPS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

node -v && docker --version && caddy version
```

### 2.4 Create a service user and get the code

```bash
# a dedicated user that may use Docker (Docker access ≈ root, so keep this user for CodeSync only)
sudo useradd --system --create-home --shell /bin/bash codesync
sudo usermod -aG docker codesync

sudo mkdir -p /opt/codesync && sudo chown codesync:codesync /opt/codesync
sudo -u codesync git clone https://github.com/<you>/<repo>.git /opt/codesync
```

(No Git remote? Copy the project instead, without `node_modules`:
`scp -r sandbox/ user@VM:/tmp/codesync` then `sudo mv /tmp/codesync/* /opt/codesync/`.)

### 2.5 Install server dependencies and configure

```bash
cd /opt/codesync/server
sudo -u codesync npm ci --omit=dev
sudo -u codesync cp .env.example .env
sudo -u codesync nano .env
```

Set at least:

```ini
PORT=4000
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/codesync?retryWrites=true&w=majority
# your Vercel URL(s) — fill in the real name after step ③; "*" covers preview deployments
CLIENT_ORIGIN=https://codesync.vercel.app,https://codesync-*.vercel.app
```

### 2.6 Prepare the sandbox images (once, ~2.8 GB)

```bash
cd /opt/codesync/server
sudo -u codesync npm run pull-images      # pulls 6 images, builds codesync-go:1.22
```

### 2.7 Run the backend as a service

```bash
sudo cp /opt/codesync/deploy/codesync.service /etc/systemd/system/codesync.service
sudo systemctl daemon-reload
sudo systemctl enable --now codesync
journalctl -u codesync -n 20 --no-pager
```

You should see:

```
[docker] engine … ready
[db] connected to mongodb+srv://…
[server] listening on http://localhost:4000
```

### 2.8 HTTPS with Caddy

```bash
sudo cp /opt/codesync/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/api.example.com/api.yourdomain.com/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Check from your own computer:

```bash
curl https://api.yourdomain.com/api/health
# {"ok":true,"mongo":true,"docker":{"cli":true,"engine":true,"version":"…"}}
```

All three must be `true` before you continue.

---

## ③ Frontend on Vercel

### Option 1 — Vercel dashboard (recommended)

1. Push the project to GitHub / GitLab / Bitbucket.
2. https://vercel.com → **Add New… → Project** → import the repository.
3. **Root Directory:** click *Edit* → choose **`client`**.
   - Framework Preset: **Vite** (auto-detected).
   - Build command `npm run build`, output directory `dist` — already set in `client/vercel.json`.
4. **Environment Variables** → add:

   | Name               | Value                          | Environments |
   |--------------------|--------------------------------|--------------|
   | `VITE_BACKEND_URL` | `https://api.yourdomain.com`   | Production, Preview |

5. Click **Deploy**. You get a URL such as `https://codesync.vercel.app`
   (rename under *Settings → Domains*, or add your own domain there).

### Option 2 — Vercel CLI

```bash
cd client
npx vercel login
npx vercel link                                   # create/link the project (root = client)
npx vercel env add VITE_BACKEND_URL production    # paste https://api.yourdomain.com
npx vercel env add VITE_BACKEND_URL preview       # same value, for preview deployments
npx vercel --prod                                 # build + deploy to production
```

### Vercel notes

- `VITE_*` variables are compiled into the JavaScript at **build** time. After changing
  `VITE_BACKEND_URL`, **redeploy** (*Deployments* → ⋯ → *Redeploy*).
- **Preview deployments** (every branch / pull request) get URLs like
  `https://codesync-git-feature-you.vercel.app` or `https://codesync-abc123-you.vercel.app`.
  Allow them with the wildcard `https://codesync-*.vercel.app` in `CLIENT_ORIGIN`.
- **Custom domain** (e.g. `codesync.yourdomain.com`): add it under *Settings → Domains*, then add
  it to `CLIENT_ORIGIN` too.
- The SPA rewrite in `client/vercel.json` makes Vercel return `index.html` for `/room/<id>`,
  so shared room links and page refreshes work.

---

## ④ Connect frontend and backend

1. On the VM, set `CLIENT_ORIGIN` to your real Vercel URL(s) (no trailing slash):
   ```ini
   CLIENT_ORIGIN=https://codesync.vercel.app,https://codesync-*.vercel.app
   # with a custom domain, add it as well:
   # CLIENT_ORIGIN=https://codesync.yourdomain.com,https://codesync.vercel.app,https://codesync-*.vercel.app
   ```
2. Restart: `sudo systemctl restart codesync`
3. Open your Vercel URL → **Create a new room** → **Copy link** → open it in a second
   browser/device → type on several lines in both → type in stdin → **▶ Run**.
   The header must say **Live** and the output must appear in both windows.

How the pieces enforce this:
- `VITE_BACKEND_URL` → `client/src/lib/api.js` sends `/api` calls and opens `wss://` sockets
  to the backend.
- `CLIENT_ORIGIN` → `server/src/index.js` sends CORS headers only to allowed origins and
  **rejects WebSocket connections from any other website (HTTP 403)**.

---

## Updating after code changes

| Part      | How |
|-----------|-----|
| Frontend  | `git push` → Vercel rebuilds and deploys automatically |
| Backend   | `cd /opt/codesync && sudo -u codesync git pull && cd server && sudo -u codesync npm ci --omit=dev && sudo systemctl restart codesync` |
| New/changed languages | additionally `sudo -u codesync npm run pull-images` |

---

## Troubleshooting

| Symptom (browser console / UI) | Cause → fix |
|--------------------------------|-------------|
| *Mixed Content … blocked* | `VITE_BACKEND_URL` is `http://…`. Use the **https://** domain from step 2.8, then redeploy on Vercel |
| *blocked by CORS policy* | Vercel URL missing from `CLIENT_ORIGIN` (exact spelling, no trailing `/`) → edit `.env`, `sudo systemctl restart codesync` |
| Works on production URL but not on a **preview** URL | Add `https://codesync-*.vercel.app` to `CLIENT_ORIGIN`, and make sure `VITE_BACKEND_URL` is set for the *Preview* environment |
| Header stays `connecting`; WebSocket error **403** | The origin isn't in `CLIENT_ORIGIN` (see above) |
| Header stays `connecting`; no 403 | Caddy not running / DNS wrong / port 443 closed → `curl https://api…/api/health`, `systemctl status caddy` |
| Requests go to `https://….vercel.app/api/…` (404) | `VITE_BACKEND_URL` wasn't set **at build time** → set it and redeploy |
| Refreshing `/room/<id>` gives 404 | Root Directory isn't `client`, so `client/vercel.json` (SPA rewrite) isn't used → fix it under *Settings → General* |
| Build fails: *Could not resolve…* / wrong package | Root Directory must be **`client`** (not the repo root) |
| `/api/health` shows `"mongo": false` | Atlas *Network Access* doesn't include the VM IP, or wrong user/password in `MONGO_URI` |
| `/api/health` shows `"engine": false` / *permission denied … docker.sock* | `codesync` user not in the `docker` group → `sudo usermod -aG docker codesync && sudo systemctl restart codesync` |
| First run of a language times out | Images not prepared → `sudo -u codesync npm run pull-images` |
| Go: *pull access denied for codesync-go* | The Go image is built locally → `npm run pull-images` |

Logs: `journalctl -u codesync -f` (backend), `journalctl -u caddy -f` (HTTPS/proxy),
Vercel → *Deployments* → a deployment → *Build Logs*, browser DevTools → Network → *WS* tab.

---

## Security checklist before sharing publicly

The app has **no login**: anyone who can open the frontend can create rooms and run code on
your VM. Before announcing it:

- [ ] Restrict access: Vercel *Settings → Deployment Protection* (password / Vercel
      Authentication), or add a login to the app, or keep the URL private.
- [ ] Add rate limiting for `POST /api/rooms/:id/run` (e.g. `express-rate-limit`).
- [ ] Keep the VM dedicated to CodeSync — access to Docker is effectively root.
- [ ] Consider gVisor (`--runtime=runsc`) for stronger container isolation.
- [ ] Keep `RUN_KEEP_CONTAINERS=false`; keep the OS and Docker updated
      (`sudo apt upgrade`, unattended-upgrades).
- [ ] Restrict Atlas *Network Access* to the VM's IP only.
