# Autoscheduler

A full-stack time-slot booking app for teachers and students. Teachers create availability blocks and configure booking settings. Students submit ranked time preferences. An AI scheduler automatically assigns everyone to their best available slot.

---

## Features

- **Teacher dashboard** — create time slots, set duration options, control how many ranked preferences students must submit (1–5), toggle appointment-blocking, and run the AI auto-scheduler
- **Student booking form** — multi-step form where students rank their preferred time windows within each slot
- **AI scheduler** — automatically assigns students to their highest-priority available slot and detects unresolvable conflicts
- **Multi-teacher support** — each teacher gets a unique `/book/:username` URL and a private dashboard at `/teacher`
- **Public directory** at `/` listing all teachers

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| pnpm | 9 or later |
| PostgreSQL | 14 or later |

Install pnpm if you don't have it:

```bash
npm install -g pnpm
```

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Iondragon-dev/Autoscheduler.git
cd Autoscheduler
```

### 2. Install dependencies

```bash
pnpm install
```

This installs packages for every workspace package in one go.

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/autoscheduler
SESSION_SECRET=replace-with-a-long-random-string
```

- `DATABASE_URL` — connection string for your PostgreSQL database
- `SESSION_SECRET` — any long random string used to sign teacher session cookies (required in production, optional in development)

Generate a strong secret:

```bash
openssl rand -hex 32
```

### 4. Run database migrations

```bash
pnpm --filter @workspace/db run migrate
```

This creates all the required tables in your database.

---

## Running in Development

Open two terminals and start each service:

**Terminal 1 — API server** (runs on port 8080 by default):

```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend** (runs on a random available port):

```bash
pnpm --filter @workspace/time-slot-form run dev
```

Then open the URL printed by the frontend (e.g. `http://localhost:5173`) in your browser.

---

## Project Structure

```
Autoscheduler/
├── artifacts/
│   ├── api-server/          # Express + Drizzle ORM backend
│   │   └── src/
│   │       ├── routes/      # auth, teachers, timeslots, ai
│   │       └── index.ts
│   └── time-slot-form/      # React + Vite frontend
│       └── src/
│           ├── pages/       # Home.tsx (student form), Teacher.tsx (dashboard)
│           ├── components/
│           └── lib/
├── lib/
│   ├── db/                  # Drizzle schema + migrations
│   ├── api-client-react/    # React Query hooks for the API
│   └── api-zod/             # Zod validation schemas
└── package.json             # pnpm workspace root
```

---

## Running Tests

```bash
pnpm --filter @workspace/time-slot-form test
```

---

## Building for Production

```bash
pnpm --filter @workspace/time-slot-form run build
pnpm --filter @workspace/api-server run build
```

Set `NODE_ENV=production` and ensure `SESSION_SECRET` is set before starting the API server in production.

---

## Routes

| Path | Description |
|------|-------------|
| `/` | Teacher directory |
| `/book/:username` | Student booking form for a specific teacher |
| `/teacher` | Teacher dashboard (requires passcode login) |

---

## AI Scheduling

The scheduler uses an AI model to optimally assign students to time slots based on their ranked preferences. Run it from the teacher dashboard under the **Schedule** tab. You can preview assignments before applying them. Students who cannot be assigned to any of their preferences are flagged separately.
