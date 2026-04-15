# Team 1 - MEC2 Inventory Management System

Inventory management web app for MEC2, built with React + Supabase.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

By default the app runs with **mock data** — no backend setup needed.

### Switching to Live Database

1. Copy `frontend/.env.example` to `frontend/.env.local`
2. Set `VITE_USE_MOCK=false`
3. Add the Supabase URL and anon key (ask Edmond for credentials)
4. `npm run dev`

## Demo Accounts

**Mock mode** (`VITE_USE_MOCK=true`):

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Admin |
| pm | pm | Project Manager |
| wm | wm | Warehouse Manager |
| la | la | Logistics Associate |
| lf | lf | Logistics Foreman |

**Live mode** (`VITE_USE_MOCK=false`):

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| pm | pm123 | Project Manager |
| wm | wm123 | Warehouse Manager |
| la | la123 | Logistics Associate |
| lf | lf123 | Logistics Foreman |

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, React Router, Motion
- **Backend:** Supabase (Postgres, Auth, REST API)
- **No custom backend server** — frontend calls Supabase directly via the JS SDK

## Project Structure

```
frontend/
  src/
    components/     # Page components
    services/       # Data layer (mock/Supabase toggle) — see services/README.md
    hooks/          # useAsyncData hook
    lib/            # Supabase client
    auth/           # Mock users + role permissions
    data/           # Mock datasets
    utils/          # Case conversion, date utilities
backend/
  supabase/         # SQL schema, seed data, demo user script
docs/
  backend-integration-plan.md   # Architecture + implementation plan
```

## Service Layer

Frontend devs: see `frontend/src/services/README.md` for the full API reference. All service functions are async and return camelCase objects. You never need to import or know about Supabase.
