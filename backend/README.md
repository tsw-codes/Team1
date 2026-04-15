# Backend — Supabase

The backend uses **Supabase** (hosted PostgreSQL + Auth + Storage + Realtime). There is no separate API server — the frontend talks to Supabase directly via the JS SDK.

## Getting Started

1. Copy `frontend/.env.example` to `frontend/.env.local`
2. Get the Supabase URL and anon key from Edmond
3. Fill in the values in `.env.local`
4. Set `VITE_USE_MOCK=false` to use the real database (or leave `true` for mock data)

That's it. No Supabase account needed — everyone shares the same project.

## Demo Accounts

| Username | Email | Password | Role |
|---|---|---|---|
| admin | admin@coolsys.com | admin123 | Admin |
| pm | pm@coolsys.com | pm123 | Project Manager |
| wm | wm@coolsys.com | wm123 | Warehouse Manager |
| la | la@coolsys.com | la123 | Logistics Associate |
| lf | lf@coolsys.com | lf123 | Logistics Foreman |

## Mock vs Real Database

The frontend defaults to mock data (`VITE_USE_MOCK=true`). This works out of the box with no credentials. Set `VITE_USE_MOCK=false` to connect to the real Supabase database.

## Folder Structure

```
backend/
├── supabase/
│   ├── 01_tables.sql         — 11 database tables
│   ├── 02_views.sql          — Views that join labels for the frontend
│   ├── 03_functions.sql      — Profile trigger, ID generation, adjustment RPC
│   ├── 04_validation.sql     — Workflow, role, and inventory auto-adjustment triggers
│   ├── 05_rls.sql            — Row Level Security policies
│   ├── seed.sql              — Demo data
│   ├── create-demo-users.mjs — Script to create demo auth users
│   └── README.md             — SQL file run order
└── SQL scripts/
    └── createAll.sql          — DEPRECATED (original schema, kept for reference)
```

## What Supabase Handles

| Concern | How |
|---|---|
| **Auth** | Email/password login, JWT sessions, password changes |
| **Database** | PostgreSQL with views for denormalized frontend queries |
| **Permissions** | RLS policies + validation triggers enforce who can do what |
| **Audit trail** | `inventory_adjustments` table (immutable), auto-logged on ship/receive |
| **Workflow** | DB triggers enforce Request → Manifest → Transfer state machine |
| **File storage** | Supabase Storage for packing slip photos (TODO) |
