# Verm Admin

A view-only admin centre for the `vermo-production` MongoDB database. Built with React, Express, and Tailwind CSS.

---

## Features

- **Secure login** — JWT-based authentication with a dedicated `admin_users` collection
- **Dashboard** — 10 live KPI cards showing document counts for key collections
- **Collection browser** — all 25 collections accessible from a grouped sidebar
- **Data table** — paginated (20 rows/page), sortable columns, text search
- **Document viewer** — click any row to see the full document as formatted JSON with a copy button
- **VPS-ready** — Express serves the built React app as static files on a single port; runs as a systemd service that starts on boot

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Tailwind CSS v3, Vite |
| Backend | Node.js, Express 4 |
| Database | MongoDB (native driver, no ORM) |
| Auth | bcryptjs + jsonwebtoken (JWT, 8h expiry) |

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A running MongoDB instance (Atlas or self-hosted) with the `vermo-production` database
- Your MongoDB connection string (URI)
- A Linux VPS with `systemd` (Ubuntu 20.04+ or similar)

---

## Project Structure

```
verm-admin/
├── server/
│   ├── index.js                  # Express entry point, serves React build
│   ├── db.js                     # MongoDB connection
│   ├── middleware/
│   │   └── auth.js               # JWT verification middleware
│   └── routes/
│       ├── auth.js               # POST /api/auth/login, GET /api/auth/me
│       ├── dashboard.js          # GET /api/dashboard/stats
│       └── collections.js        # GET /api/collections/:name, /:name/:id
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Collection.jsx    # Generic collection table page
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Sidebar + top bar shell
│   │   │   ├── StatCard.jsx      # KPI card on dashboard
│   │   │   ├── DataTable.jsx     # Paginated, sortable table
│   │   │   └── DocumentModal.jsx # Full-document JSON viewer
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Auth state + login/logout helpers
│   │   ├── api.js                # Axios instance with JWT header
│   │   ├── App.jsx               # Router + protected routes
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── scripts/
│   └── deploy.sh                 # One-command deploy + systemd install script
├── verm-admin.service            # systemd unit file
├── seed-admin.js                 # Creates the first admin user in MongoDB
├── package.json                  # Root scripts
└── .env.example                  # Environment variable template
```

---

## Local Development Setup

### 1. Clone and enter the repository

```bash
git clone https://github.com/kolaksayo/verm-admin_test.git
cd verm-admin_test
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Your MongoDB connection string
# Include the database name at the end, or set MONGODB_DB separately
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/vermo-production

# The database name to connect to
MONGODB_DB=vermo-production

# A long, random secret used to sign JWTs — keep this private
# Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=replace-with-a-long-random-secret

# Port the server will listen on
PORT=3001

# Credentials for the initial admin account (used by the seed script)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123
```

> **Security note:** Never commit your `.env` file. It is already listed in `.gitignore`.

### 3. Install all dependencies

```bash
npm run install:all
```

### 4. Seed the first admin user

```bash
npm run seed
```

You should see:

```
✅ Admin user created/updated successfully
──────────────────────────────────
   Username : admin
   Password : changeme123
──────────────────────────────────
Change your password after first login!
```

> You can re-run `npm run seed` at any time to reset the admin password.

### 5. Start in development mode

**Terminal 1 — Express API server (with nodemon):**
```bash
npm run dev:server
```

**Terminal 2 — Vite dev server (React):**
```bash
npm run dev:client
```

The React dev server runs on port `5173` and proxies all `/api` calls to Express on port `3001`. Open `http://localhost:5173`.

---

## Production Deployment to `/opt/verm-admin_test`

This is the recommended setup for a Linux VPS. The app lives at `/opt/verm-admin_test` and runs as a **systemd service** that starts automatically on boot.

### Step 1 — SSH into your server

```bash
ssh root@your-server-ip
```

### Step 2 — Install Node.js (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v   # should print v20.x.x
```

### Step 3 — Clone the repository to `/opt`

```bash
git clone https://github.com/kolaksayo/verm-admin_test.git /opt/verm-admin_test
```

### Step 4 — Create the `.env` file

```bash
cp /opt/verm-admin_test/.env.example /opt/verm-admin_test/.env
nano /opt/verm-admin_test/.env
```

Fill in your `MONGODB_URI`, `JWT_SECRET`, and the admin credentials. Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

To generate a secure `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Step 5 — Install dependencies and build the frontend

```bash
cd /opt/verm-admin_test
npm run install:all
npm run build
```

### Step 6 — Seed the admin user

```bash
npm run seed
```

### Step 7 — Install and enable the systemd service

```bash
# Copy the service file into systemd
cp /opt/verm-admin_test/verm-admin.service /etc/systemd/system/verm-admin.service

# Reload systemd so it picks up the new file
systemctl daemon-reload

# Enable the service to start automatically on every boot
systemctl enable verm-admin

# Start it now
systemctl start verm-admin

# Confirm it is running
systemctl status verm-admin
```

You should see `Active: active (running)`. The admin centre is now live at `http://your-server-ip:3001`.

---

## Updating the App

To deploy new code after pulling changes:

```bash
cd /opt/verm-admin_test

# Pull latest
git pull origin claude/admin-center-mongodb-YPyBe

# Rebuild frontend
npm run build

# Restart the service
systemctl restart verm-admin
```

Or use the deploy script, which handles all of the above in one command:

```bash
bash /opt/verm-admin_test/scripts/deploy.sh
```

> The deploy script also auto-detects your `node` binary path, which is important if you installed Node via `nvm`.

---

## Useful Service Commands

```bash
# View live logs
journalctl -u verm-admin -f

# View last 100 lines of logs
journalctl -u verm-admin -n 100

# Stop the service
systemctl stop verm-admin

# Restart the service
systemctl restart verm-admin

# Disable auto-start on boot
systemctl disable verm-admin

# Check status
systemctl status verm-admin
```

---

## Nginx Reverse Proxy (optional)

To serve the admin centre on a subdomain (`admin.yourdomain.com`) with HTTPS instead of exposing port 3001 directly:

### 1. Install Nginx and Certbot

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

### 2. Create an Nginx site config

```bash
nano /etc/nginx/sites-available/verm-admin
```

Paste:

```nginx
server {
    listen 80;
    server_name admin.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

### 3. Enable the site and reload Nginx

```bash
ln -s /etc/nginx/sites-available/verm-admin /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 4. Obtain an SSL certificate

```bash
certbot --nginx -d admin.yourdomain.com
```

Certbot will automatically update your Nginx config to redirect HTTP → HTTPS. The admin centre is now available at `https://admin.yourdomain.com`.

---

## Changing the Admin Password

Update `ADMIN_PASSWORD` in `/opt/verm-admin_test/.env`, then re-run the seed script:

```bash
cd /opt/verm-admin_test && npm run seed
```

---

## Available Collections

All 25 collections in `vermo-production` are accessible from the sidebar:

| Group | Collections |
|-------|------------|
| Users & Finance | `users`, `walletusers`, `transactions`, `referrals`, `contracts` |
| Betting | `game_bet`, `game_bet_leaderboard`, `football_bet_template` |
| Football | `football_fixtures`, `football_leagues`, `football_seasons`, `football_teams`, `football_team_players`, `football_fixture_stats`, `football_fixture_head_to_head` |
| Social | `follows`, `likes`, `likedsports`, `comments`, `chatrooms`, `userchatsubscriptions` |
| System | `adminauditlogs`, `hook_logs`, `currencytypes`, `dollar_naira_rate` |

---

## API Reference

All routes except `/api/auth/login` require an `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login with `{ username, password }`, returns `{ token, username }` |
| `GET` | `/api/auth/me` | Returns the currently authenticated user |
| `GET` | `/api/dashboard/stats` | Returns document counts for 10 key collections |
| `GET` | `/api/collections` | Returns the list of allowed collection names |
| `GET` | `/api/collections/:name` | Returns paginated documents from a collection |
| `GET` | `/api/collections/:name/:id` | Returns a single document by `_id` |

### Collection query parameters

```
GET /api/collections/:name?page=1&limit=20&search=&sort=_id&order=desc
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Documents per page (max 100) |
| `search` | `""` | Matches ObjectId exactly, or regex across all string fields |
| `sort` | `_id` | Field to sort by |
| `order` | `desc` | Sort direction: `asc` or `desc` |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | Full MongoDB connection string |
| `MONGODB_DB` | No | `vermo-production` | Database name |
| `JWT_SECRET` | Yes | — | Secret key for signing JWTs |
| `PORT` | No | `3001` | Port the Express server listens on |
| `ADMIN_USERNAME` | No | `admin` | Admin username (used by seed script) |
| `ADMIN_PASSWORD` | No | `changeme123` | Admin password (used by seed script) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install server and client dependencies |
| `npm run build` | Build the React frontend into `client/dist/` |
| `npm start` | Start the production server |
| `npm run dev:server` | Start Express with nodemon (hot-reload) |
| `npm run dev:client` | Start Vite dev server (hot-reload) |
| `npm run seed` | Create or reset the admin user in MongoDB |
