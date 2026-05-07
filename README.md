# Verm Admin

A view-only admin centre for the `vermo-production` MongoDB database. Built with React, Express, and Tailwind CSS.

---

## Features

- **Secure login** — JWT-based authentication with a dedicated `admin_users` collection
- **Dashboard** — 10 live KPI cards showing document counts for key collections
- **Collection browser** — all 25 collections accessible from a grouped sidebar
- **Data table** — paginated (20 rows/page), sortable columns, text search
- **Document viewer** — click any row to see the full document as formatted JSON with a copy button
- **VPS-ready** — Express serves the built React app as static files on a single port

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
├── seed-admin.js                 # Creates the first admin user in MongoDB
├── package.json                  # Root scripts
└── .env.example                  # Environment variable template
```

---

## Setup

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

This installs both the server and client packages in one command:

```bash
npm run install:all
```

### 4. Seed the first admin user

This creates (or updates) an admin user in the `admin_users` collection of your MongoDB database, using the `ADMIN_USERNAME` and `ADMIN_PASSWORD` values from your `.env`:

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

### 5. Build the React frontend

```bash
npm run build
```

This compiles the React app into `client/dist/`, which Express will serve as static files.

### 6. Start the server

```bash
npm start
```

The admin centre is now available at `http://your-server:3001`.

---

## Development Mode

To run the frontend and backend simultaneously with hot-reloading:

**Terminal 1 — Express API server (with nodemon):**
```bash
npm run dev:server
```

**Terminal 2 — Vite dev server (React):**
```bash
npm run dev:client
```

The React dev server runs on port `5173` and proxies all `/api` requests to the Express server on port `3001`, so you only need to open `http://localhost:5173`.

---

## Running in Production (VPS)

### Using a process manager (recommended)

Install PM2 globally if you haven't already:

```bash
npm install -g pm2
```

Start the admin server:

```bash
pm2 start server/index.js --name verm-admin
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

### Using a reverse proxy (Nginx)

To expose the admin centre on a subdomain (e.g. `admin.yourdomain.com`) with HTTPS, add an Nginx server block:

```nginx
server {
    listen 80;
    server_name admin.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name admin.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/admin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Reload Nginx after editing:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Available Collections

All 25 collections in `vermo-production` are accessible, grouped in the sidebar:

| Group | Collections |
|-------|------------|
| Users & Finance | `users`, `walletusers`, `transactions`, `referrals`, `contracts` |
| Betting | `game_bet`, `game_bet_leaderboard`, `football_bet_template` |
| Football | `football_fixtures`, `football_leagues`, `football_seasons`, `football_teams`, `football_team_players`, `football_fixture_stats`, `football_fixture_head_to_head` |
| Social | `follows`, `likes`, `likedsports`, `comments`, `chatrooms`, `userchatsubscriptions` |
| System | `adminauditlogs`, `hook_logs`, `currencytypes`, `dollar_naira_rate` |

---

## API Reference

All API routes (except login) require a `Authorization: Bearer <token>` header.

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
| `search` | `""` | Search term — matches ObjectId exactly, or regex on all string fields |
| `sort` | `_id` | Field to sort by |
| `order` | `desc` | Sort direction: `asc` or `desc` |

---

## Changing the Admin Password

Update `ADMIN_PASSWORD` in your `.env`, then re-run the seed script:

```bash
npm run seed
```

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
