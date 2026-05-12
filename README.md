# Team 1 - MEC2 Inventory Management System

A mobile-first web app for logging deliveries, tracking material across warehouses and job sites, and handling field requests. This inventory management web app was designed for MEC2, built with React + Supabase.

The purpose of this project is to support the company's operations by providing logistics crews, warehouse staff, and project managers with a centralized mobile application that improves material tracking and visibility from delivery all the way through installation.

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
| admin | admin | Admin |
| pm | pm123 | Project Manager |
| wm | wm123 | Warehouse Manager |
| la | la123 | Logistics Associate |
| lf | lf123 | Logistics Foreman |

## Features

### Authentication and account flow
- Login flow with role-based users (mock and Supabase)
- Protected routes — unauthenticated users are redirected to login
- Session persistence across page refresh (Supabase JWT)
- Account page with username, name, role display and log out
- Change password with current password verification, strength rules, and confirmation matching

### Role permissions
- Role permission model in `frontend/src/auth/permissions.js`
- 5 roles: Admin, Project Manager, Warehouse Manager, Logistics Associate, Logistics Foreman
- Home page actions filtered by role permissions
- Two-layer security: UI gates + database-level RLS and triggers

### Implemented pages
- **Login** — authentication for the system using username/password
- **Home** — Displays permission-gated action tiles per role, allowing for access to all the pages
- **Account** — Displays profile info, change password, log out
- **View Inventory** — Displays inventory status at locations. Includes search, filters (project/category/status), summary cards, item detail panel with permission-gated cost/actions, inventory adjustment (increase/decrease/set)
- **Receive Inventory** — Allows for logging delivery and item entry forms. Includes validation with first-error scroll, add/remove item rows, document upload/scan preview UI
- **Request Material** — Allows to request new material . Uses a metadata form, multi-item request builder, warehouse-based item selection, quantity validation against available inventory
- **Pending Requests** — Review and approve/reject requests with notes
- **Manifest Inventory** — Create outbound/return/warehouse transfer manifests from approved requests or manually, confirm quantities against available stock
- **Transfer Inventory** — Ship and receive transfers, partial receipt with variance tracking and exception notes
- **Shipment Tracking** — Displays all shipments being tracked by the system
### Backend integration
- All services toggle between mock data and live Supabase via `VITE_USE_MOCK` flag
- Database triggers enforce workflow state machine (request → manifest → transfer)
- Inventory auto-adjusts on ship (decrease source) and receive (increase destination)
- ID generation handled by database functions (RQ-xxxx, MO-xxxx, TO-xxxx)
- Full audit trail: who requested, approved, shipped, received, and any discrepancies

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

## Known Issues

Delivery and image capture still needs to be implemented
Serial Number Capture and Entry still needs to be implemented


## Credits

This system was designed and implemented by David Olatunji, Edmond Ndanji, Jonathan Smith, Oluwatomisin Sapara-Williams, Thomas Kratz
