# Backend Overview — for the Team

A short read on what the backend is, why we picked it, and what it means for the code you write.

---

## TL;DR

- Originally we planned **FastAPI on Railway + Postgres**. We switched to **Supabase**.
- Supabase = hosted Postgres + Auth + auto-generated REST API, all behind one SDK.
- **There is no custom backend server.** The React app talks directly to Supabase.
- You don't touch Supabase. You call **service functions** (`frontend/src/services/`) and get back plain JS objects.

---

## Why we switched from FastAPI + Railway → Supabase

The original SRS stack was FastAPI + SQLAlchemy hosted on Railway, with Postgres alongside. That meant we'd need to build and maintain:

- A FastAPI server (routes, request/response schemas, error handling)
- An auth system (signup, login, password reset, JWT issuing, session management)
- A database layer (SQLAlchemy models that mirror the DB)
- A deployment pipeline (Railway config, env vars, restarts on push)
- CORS, rate limiting, logging — all the boilerplate

For a 5-person semester project, that's weeks of plumbing before any feature work.

**Supabase gives all of that for free:**

| Thing we'd have to build | Supabase equivalent |
|---|---|
| FastAPI routes for every table | Auto-generated REST API from the schema |
| SQLAlchemy models | Just write SQL — the SDK reads it |
| Auth endpoints + JWT | Built-in `supabase.auth` |
| User table + password hashing | `auth.users` table managed by Supabase |
| Server deployment | Supabase hosts everything |
| Session restore on refresh | One SDK call |
| Logs / monitoring | Built into the dashboard |

Net result: we spent our time on **the workflow logic** (request → manifest → transfer, role enforcement, audit trail) instead of boilerplate.

---

## How Supabase is different from a traditional API server

### Traditional setup (what we *would* have had)

```
React  ──HTTP──►  FastAPI  ──SQL──►  Postgres
                  (your code)        (your DB)
```

Every feature requires three layers: a Postgres table, a FastAPI route, and frontend code that calls the route. You write all three.

### Supabase setup (what we have now)

```
React  ──SDK──►  Supabase (Postgres + auto REST + Auth)
                 (the DB IS the API)
```

**Key shift:** the database *is* the API. You write a table, and the REST endpoints to read/write it exist immediately. Permissions don't live in route handlers — they live in the database itself as **Row Level Security (RLS) policies** and **triggers**.

### What this means in practice

| Concern | Traditional (FastAPI) | Supabase (us) |
|---|---|---|
| "Add a new field" | Migration + model + Pydantic schema + route | Add column in SQL — it's exposed |
| "Only PMs can approve" | Check role in route handler | RLS policy + trigger on the table |
| "Auto-update inventory on ship" | Service code in the route | Postgres trigger (always runs, can't be skipped) |
| "User logs in" | Build login route, hash password, issue JWT | `supabase.auth.signInWithPassword()` |
| "Where does business logic live?" | Python service classes | SQL functions and triggers |

The trade-off: **more logic in the database**, less in app code. That's why our `backend/supabase/` folder is mostly SQL files (tables, views, triggers, RLS policies) and there's no Python server anywhere.

---

## How the integration works

The code is structured so that **you never see Supabase**. Here's the layering:

```
┌──────────────────────────────────────────────────────────┐
│  Page components (what you write)                        │
│    import { getAllRequests } from '../services/...'      │
│    const { data, loading } = useAsyncData(getAllRequests)│
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  services/ (the integration layer — already built)       │
│    Hides all Supabase calls. Returns clean JS objects.   │
│    Toggle: VITE_USE_MOCK=true uses mock data instead.    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (Postgres + Auth + REST + RLS + Triggers)      │
│    Enforces workflow, roles, and audit trail at DB level │
└──────────────────────────────────────────────────────────┘
```

### The contract you work against

Everything is in **`frontend/src/services/README.md`** — that's the API reference. The rules:

1. Service functions are **`async`** — always `await` them.
2. Return values are **camelCase** JS objects (not raw DB rows).
3. For data that loads on mount, use the `useAsyncData` hook:
   ```jsx
   const { data, loading, error, refetch } = useAsyncData(getAllRequests)
   if (loading) return <Spinner />
   if (error)   return <ErrorMessage message={error.message} />
   return <Table rows={data ?? []} />
   ```
4. For actions (create / approve / etc.), call the service in your handler, then `refetch()`:
   ```jsx
   async function handleApprove(id) {
     await approveRequest(id, currentUser.username, notes)
     refetch()
   }
   ```
5. Never `import` Supabase in a page. If you feel the need to, that's a sign the logic belongs in a service.

### The mock/live toggle

- `VITE_USE_MOCK=true` (default) → services return mock data. **No setup needed to run the app.**
- `VITE_USE_MOCK=false` → services hit the live Supabase database (requires `.env.local` with credentials).

Same function signatures, same return shapes. Your page code doesn't change between modes.

---

## Two-layer security (why you don't need to add server checks)

- **UI layer** — `frontend/src/auth/permissions.js` decides which buttons a role can see. You gate the UI here.
- **DB layer** — Even if someone bypasses the UI and calls the API directly, RLS policies + triggers in Postgres reject unauthorized writes with clear error messages.

You handle the UI side. The DB has your back on the rest.

---

## Workflow is enforced by the database

```
Request: pending_approval → approved / rejected
Manifest: finalized
Transfer: ready_to_ship → in_transit → completed / exception
```

- State transitions are enforced by triggers — you can't accidentally skip a step.
- **Inventory auto-adjusts** on ship (decrement source) and receive (increment destination by received qty). Don't update inventory by hand.
- **IDs are DB-generated** (RQ-xxxx, MO-xxxx, TO-xxxx). Don't pick IDs in your `create*` calls.
- **Audit fields are populated for free** — `requestedBy`, `approvedAt`, `shippedBy`, etc. are on every object. If you need to show "who did what when" in the UI, the data is already there.

---

## Common gotchas (worth knowing upfront)

- **Empty filter values throw 406s.** Guard your service calls: `if (!warehouseValue) return` before fetching items by warehouse.
- **Always `?? []` arrays from `useAsyncData`** — `data` is `null` while loading.
- **Don't send display-only fields back on update** (e.g. `completionOutcome` on transfers — it's computed by the DB).
- All service errors are human-readable. You can show `error.message` directly in a toast.

---

## Where to look for what

| You want to... | Look at |
|---|---|
| Use a service in a page | `frontend/src/services/README.md` |
| Understand the architecture or DB schema | `docs/backend-integration-plan.md` (has diagrams) |
| Run/seed the database yourself | `backend/supabase/README.md` |
| Get started running the app | root `README.md` |
