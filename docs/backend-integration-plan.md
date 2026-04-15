# MEC2 Inventory System — Supabase Backend Integration Plan

## Context

The frontend is ~90% complete with mock data. A separate team member works on the UI. We need to integrate Supabase as the backend without breaking existing page components. The services layer (`frontend/src/services/`) is the integration point — we rewrite service internals while keeping the same function signatures (made async).

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React App)                      │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Pages   │──│  Services    │──│  supabaseClient.js        │  │
│  │          │  │  (async)     │  │  (@supabase/supabase-js)  │  │
│  └──────────┘  └──────────────┘  └─────────────┬─────────────┘  │
│       │                                        │                │
│  ┌──────────┐                                  │                │
│  │permissions│ (frontend gate)                 │                │
│  │   .js    │                                  │                │
│  └──────────┘                                  │                │
└────────────────────────────────────────────────┼────────────────┘
                                                 │ HTTPS
                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE (Cloud)                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Auth        │  │  Storage     │  │  Realtime             │  │
│  │  (JWT/email) │  │  (packing    │  │  (request updates,    │  │
│  │              │  │   slips)     │  │   inventory changes)  │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────────┘  │
│         │                                                       │
│  ┌──────▼───────────────────────────────────────────────────┐   │
│  │                   PostgreSQL                              │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐   │   │
│  │  │locations │ │profiles  │ │inventory │ │requests     │   │   │
│  │  │projects  │ │(→auth)   │ │_items    │ │request_items│   │   │
│  │  └─────────┘ └──────────┘ └──────────┘ └─────────────┘   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────────────┐  │   │
│  │  │manifests │ │transfers │ │inventory_adjustments      │  │   │
│  │  │manifest_ │ │transfer_ │ │(audit log)                │  │   │
│  │  │items     │ │items     │ └───────────────────────────┘  │   │
│  │  └──────────┘ └──────────┘                                │   │
│  │                                                           │   │
│  │  ── Views ──────────────────────────────────────────────   │   │
│  │  requests_view, manifests_view, transfers_view            │   │
│  │  (JOIN labels for denormalized frontend shapes)           │   │
│  │                                                           │   │
│  │  ── RLS Policies ──────────────────────────────────────   │   │
│  │  SELECT: all authenticated users (internal app)           │   │
│  │  INSERT/UPDATE/DELETE: gated by role from profiles        │   │
│  │                                                           │   │
│  │  ── Functions (RPC) ───────────────────────────────────   │   │
│  │  generate_request_id(), generate_manifest_id(type),       │   │
│  │  generate_transfer_id(type),                              │   │
│  │  create_inventory_adjustment(...)                         │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: How a Request Moves Through the System

```
  Logistics Foreman              Project Manager           Warehouse Manager          Logistics Associate
        │                              │                          │                          │
        │  1. Create Request           │                          │                          │
        │  (RQ-1001)                   │                          │                          │
        ▼                              │                          │                          │
  ┌──────────┐                         │                          │                          │
  │ requests │─── status: pending ─────▶                          │                          │
  └──────────┘                         │                          │                          │
                                       │  2. Approve Request      │                          │
                                       │                          │                          │
                                       ▼                          │                          │
                                 status: approved ────────────────▶                          │
                                                                  │                          │
                                                                  │  3. Create Manifest      │
                                                                  │  (MO-1001)               │
                                                                  ▼                          │
                                                            ┌──────────┐                     │
                                                            │manifests │                     │
                                                            └──────────┘                     │
                                                                  │                          │
                                                                  │  4. Create Transfer      │
                                                                  │  (TO-1001)               │
                                                                  ▼                          │
                                                            ┌──────────┐                     │
                                                            │transfers │── ready_to_ship ────▶
                                                            └──────────┘                     │
                                                                                             │
                                                                                5. Ship      │
                                                                                ▼            │
                                                                          status: in_transit  │
                                                                                │            │
                                                                                ▼            │
                                                                          6. Receive         │
                                                                          status: completed  │
                                                                                │            │
                                                                                ▼            │
                                                                        ┌──────────────┐     │
                                                                        │inventory_items│    │
                                                                        │qty updated    │    │
                                                                        └──────────────┘     │
```

---

## Database Schema (Entity Relationships)

```
  ┌───────────┐       ┌───────────┐
  │ locations │◄──────│ projects  │
  │           │  1:N  │           │
  │ value PK  │       │ value PK  │
  │ label     │       │ label     │
  │ type      │       │ loc_value │
  └─────┬─────┘       └─────┬─────┘
        │                    │
        │ (FK refs from      │ (FK refs from
        │  many tables)      │  many tables)
        │                    │
  ┌─────▼─────────────────────────────────────────────────┐
  │                    inventory_items                      │
  │ id (serial PK)                                         │
  │ name, sku, quantity, unit, category, status             │
  │ location_value FK──────────────────────► locations      │
  │ location_detail (free text sub-location)                │
  │ project (display name)                                  │
  │ unit_cost, total_cost, updated_at                       │
  └────────┬──────────────────────────────────────────────┘
           │ (referenced by)
           │
     ┌─────┼──────────────┬──────────────────┐
     │     │              │                  │
     ▼     ▼              ▼                  ▼
┌─────────────┐   ┌──────────────┐   ┌───────────────────┐
│request_items│   │manifest_items│   │transfer_items     │
│             │   │              │   │                   │
│ request_id──┤   │ manifest_id──┤   │ transfer_id───────┤
│ inv_item_id │   │ inv_item_id  │   │ inv_item_id       │
│ req_qty     │   │ manifest_qty │   │ manifest/ship/recv│
└──────┬──────┘   └──────┬───────┘   │ variance_reason   │
       │                 │           └────────┬──────────┘
       ▼                 ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  requests    │  │  manifests   │  │  transfers       │
│              │  │              │  │                  │
│ id (RQ-XXXX) │  │ id (MO/MR/  │  │ id (TO/TR/      │
│ status_value │  │    MW-XXXX)  │  │    TW-XXXX)     │
│ location_val │  │ manifest_type│  │ transfer_type    │
│ project_val  │  │ request_id───┤  │ manifest_id──────┤
│ requested_by │  │ source_loc   │  │ source_loc       │
│ approved_by  │  │ dest_loc     │  │ dest_loc         │
│ priority_val │  │ created_by   │  │ shipped/received │
│ needed_by    │  │ finalized_by │  │ exception_notes  │
└──────────────┘  └──────────────┘  └──────────────────┘
                                            │
  ┌──────────────────┐                      │
  │  profiles        │       ┌──────────────────────────┐
  │                  │       │  inventory_adjustments    │
  │ id (UUID) ───────┤       │                          │
  │   FK→auth.users  │       │ id (ADJ-XXXX)            │
  │ username (unique)│       │ inv_item_id FK            │
  │ name             │       │ adjustment_type           │
  │ role             │       │ qty_change, prev, new     │
  └──────────────────┘       │ reason, adjusted_by       │
                             └──────────────────────────┘
```

---

## Permissions Architecture

### Two-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: Frontend (UI Gate)               │
│                                                              │
│   permissions.js maps role → permission strings              │
│   Pages check permissions before showing buttons/actions     │
│   This controls WHAT THE USER SEES                           │
│                                                              │
│   Example: logisticsAssociate cannot see "Approve" button    │
│   because they lack "approve_requests" permission            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ (API calls still go through)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 2: Supabase RLS (DB Gate)           │
│                                                              │
│   Row Level Security policies on each table                  │
│   Enforced at the database level — cannot be bypassed        │
│   This controls WHAT THE USER CAN ACTUALLY DO                │
│                                                              │
│   Example: even if someone crafts a direct API call,         │
│   RLS blocks unauthorized writes                             │
└─────────────────────────────────────────────────────────────┘
```

### Role → Permission Mapping

```
┌──────────────────┬────────┬────────┬────────┬────────┬────────┐
│ Capability       │ Admin  │  PM    │  WM    │  LA    │  LF    │
├──────────────────┼────────┼────────┼────────┼────────┼────────┤
│ View Inventory   │   ✓    │   ✓    │   ✓    │   ✓    │   ✓    │
│ View Costs       │   ✓    │   ✓    │   ✓    │        │        │
│ Receive (WH)     │   ✓    │        │   ✓    │        │        │
│ Receive (Site)   │   ✓    │        │        │   ✓    │   ✓*   │
│ Adjust (WH)      │   ✓    │        │   ✓    │        │        │
│ Adjust (Site)    │   ✓    │        │        │   ✓    │   ✓*   │
│ Request Material │   ✓    │        │        │        │   ✓    │
│ Approve Requests │   ✓    │   ✓    │        │        │        │
│ Create Manifest  │   ✓    │        │   ✓    │   ✓    │   ✓*   │
│ Transfer         │   ✓    │        │   ✓    │   ✓    │   ✓*   │
│ Track Shipment   │   ✓    │   ✓    │        │        │   ✓    │
│ Manage Users     │   ✓    │        │        │        │        │
│ Manage Locations │   ✓    │        │        │        │        │
│ Upload POs       │   ✓    │   ✓    │        │        │        │
└──────────────────┴────────┴────────┴────────┴────────┴────────┘

PM = Project Manager, WM = Warehouse Manager
LA = Logistics Associate, LF = Logistics Foreman
* LF inherits LA permissions + has request/track abilities
```

### RLS Policy Design

```sql
-- PATTERN: All authenticated users can read (internal company app)
CREATE POLICY "read_all" ON [table]
  FOR SELECT TO authenticated
  USING (true);

-- PATTERN: Write access gated by role
CREATE POLICY "write_by_role" ON requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'logisticsForeman')
    )
  );

-- PATTERN: Approve/reject only for authorized roles
CREATE POLICY "approve_requests" ON requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
    )
  );
```

---

## Auth Flow

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Login Page  │     │  Supabase Auth   │     │  profiles table  │
│              │     │                  │     │                  │
│  username ───┤     │                  │     │                  │
│  password    │     │                  │     │                  │
└──────┬───────┘     └────────┬─────────┘     └────────┬─────────┘
       │                      │                        │
       │ 1. Convert to email  │                        │
       │ "admin" → "admin@    │                        │
       │  coolsys.com"        │                        │
       │                      │                        │
       │ 2. signInWithPassword│                        │
       ├─────────────────────►│                        │
       │                      │                        │
       │   3. JWT returned    │                        │
       │◄─────────────────────┤                        │
       │                      │                        │
       │ 4. Fetch profile     │                        │
       ├──────────────────────┼───────────────────────►│
       │                      │                        │
       │ 5. { username, name, role }                   │
       │◄─────────────────────┼────────────────────────┤
       │                      │                        │
       │ 6. getPermissionsForRole(role)                │
       │    → permissions[]   │                        │
       │                      │                        │
       │ 7. Render HomePage   │                        │
       │    with permissions  │                        │
       ▼                      │                        │

  ┌─────────────────────────────────────────────────────┐
  │  Session Persistence (on page refresh)              │
  │                                                     │
  │  App.jsx useEffect on mount:                        │
  │    1. supabase.auth.getSession()                    │
  │    2. If session exists → fetch profile → logged in │
  │    3. If no session → show login page               │
  │                                                     │
  │  supabase.auth.onAuthStateChange() listener         │
  │    → auto-updates state on token refresh/expiry     │
  └─────────────────────────────────────────────────────┘
```

---

## Logging & Audit Trail

### What Gets Logged and Where

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUDIT TRAIL                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  inventory_adjustments table                             │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  Every qty change is recorded:                           │   │
│  │  • WHO adjusted (adjusted_by → username)                 │   │
│  │  • WHEN (adjusted_at → timestamp)                        │   │
│  │  • WHAT changed (inventory_item_id)                      │   │
│  │  • HOW (adjustment_type: increase/decrease/set)          │   │
│  │  • BY HOW MUCH (previous_qty → new_qty, qty_change)      │   │
│  │  • WHY (reason: free text)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  requests table                                          │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  Built-in audit fields:                                  │   │
│  │  • requested_by + created_at (who requested, when)       │   │
│  │  • approved_by + approved_at (who approved, when)        │   │
│  │  • rejected_by + rejected_at (who rejected, when)        │   │
│  │  • approval_notes (why approved/rejected)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  manifests table                                         │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  • created_by + created_at                               │   │
│  │  • finalized_by + finalized_at                           │   │
│  │  • Links back to request_id (full chain)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  transfers table                                         │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  • created_by + created_at                               │   │
│  │  • shipped_by + shipped_at                               │   │
│  │  • received_by + received_at                             │   │
│  │  • exception_notes (discrepancy explanation)             │   │
│  │  • Links back to manifest_id + request_id (full chain)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  transfer_items table                                    │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  Per-item tracking:                                      │   │
│  │  • manifest_quantity (what was supposed to ship)          │   │
│  │  • shipped_quantity  (what actually shipped)              │   │
│  │  • received_quantity (what actually arrived)              │   │
│  │  • variance_reason   (why numbers differ)                │   │
│  │  RED FLAG: shipped ≠ received → exception status         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Supabase Built-in Logging                               │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  • Auth logs: every login/logout/password change         │   │
│  │    (Supabase dashboard → Authentication → Logs)          │   │
│  │  • API logs: every request to the database               │   │
│  │    (Supabase dashboard → Edge Functions → Logs)          │   │
│  │  • Postgres logs: query performance, errors              │   │
│  │    (Supabase dashboard → Database → Logs)                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Full Traceability Chain

```
  You can trace any item's journey end-to-end:

  Request RQ-1002
    ├── requested_by: "lf" at 2026-03-28T10:00:00
    ├── approved_by: "pm" at 2026-03-28T14:30:00
    │
    └──► Manifest MO-1001
         ├── created_by: "wm" at 2026-03-29T08:00:00
         ├── items: [{ Flexible Duct 10in, qty: 50 }, ...]
         │
         └──► Transfer TO-1001
              ├── shipped_by: "la" at 2026-03-30T09:00:00
              ├── received_by: "la" at 2026-03-30T16:00:00
              ├── items:
              │   ├── Flexible Duct: manifest=50, shipped=50, received=48
              │   │   └── variance_reason: "2 rolls damaged in transit"
              │   └── ...
              │
              └──► inventory_items qty updated
                   └──► inventory_adjustments logged
```

---

## Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend Service Layer                     │
│                                                             │
│  Each service file exports the SAME function names as       │
│  before, but internals call Supabase instead of mock data.  │
│  All functions become async.                                │
│                                                             │
│  ┌───────────────┐  ┌────────────────┐  ┌───────────────┐   │
│  │ authService   │  │ projectService │  │inventoryServ. │   │
│  │               │  │                │  │               │   │
│  │ authenticate  │  │ getLocations   │  │ getAllInv.    │   │
│  │ signOut       │  │ getProjects    │  │ getFilters   │   │
│  │ updatePwd     │  │ getByValue     │  │ adjustInv.   │   │
│  │ getSession    │  │ getForPerms    │  │ findById     │   │
│  └───────┬───────┘  └───────┬────────┘  └──────┬────────┘   │
│          │                  │                   │            │
│  ┌───────┴──────┐  ┌───────┴────────┐  ┌───────┴────────┐   │
│  │requestServ.  │  │manifestServ.   │  │transferServ.   │   │
│  │              │  │                │  │                │   │
│  │ getAll       │  │ getAll         │  │ getAll         │   │
│  │ create       │  │ create         │  │ create         │   │
│  │ approve      │  │ update         │  │ update         │   │
│  │ reject       │  │ findById       │  │ ship/receive   │   │
│  │ subscribe*   │  │ getAllowed      │  │ findById       │   │
│  └──────────────┘  └────────────────┘  └────────────────┘   │
│                                                             │
│  * subscribe uses Supabase Realtime instead of custom       │
│    pub-sub pattern                                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Shared utilities                                     │    │
│  │                                                      │    │
│  │ supabaseClient.js  — single Supabase instance        │    │
│  │ caseUtils.js       — snake_case ↔ camelCase          │    │
│  │ useAsyncData.js    — hook for async loading in pages  │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Supabase Project + Client Setup
1. Create Supabase project at supabase.com/dashboard
2. Note project URL + anon key from Settings > API
3. Enable email/password auth, disable email confirmation for dev
4. Set site URL to `http://localhost:5173`
5. Install SDK: `npm install @supabase/supabase-js`
6. Create `frontend/src/lib/supabaseClient.js`
7. Create `frontend/.env.local` with credentials
8. Add `.env.local` to `.gitignore`

### Phase 2: Database Schema ✅ DONE
SQL files live in `backend/supabase/`.
- `schema.sql` — ✅ all tables, views, triggers, RLS policies, ID generation functions, and atomic inventory adjustment RPC (combined into one file)
- `seed.sql` — TODO: demo data from existing mock files

**Decisions made:**
- `total_cost` uses a trigger instead of `GENERATED ALWAYS AS` (Supabase tooling compatibility issue)
- `order_date` added to requests table (stakeholder request for PO fallback)
- `returned` added as inventory adjustment type (wrong inventory flow from 03/03 meeting)
- Original `createAll.sql` kept in `backend/SQL scripts/` but marked deprecated
- `@supabase/supabase-js` latest stable is v2.103.0 — no v3 migration needed

### Phase 3: Frontend Utilities
1. `src/utils/caseUtils.js` — snake/camel transforms
2. `src/hooks/useAsyncData.js` — async data loading hook

### Phase 4: Service Rewrites (in dependency order)
1. `authService.js` + `App.jsx` auth flow
2. `projectService.js` (locations/projects — referenced by everything)
3. `inventoryService.js`
4. `requestService.js`
5. `manifestService.js`
6. `transferService.js`
7. `storageService.js` (new — packing slip uploads)

### Phase 5: Page Updates (minimal)
- Add `useAsyncData` + loading states to 7 pages
- Make submit handlers async

### Phase 6: Verification
1. Auth — login/logout all 5 users, session persistence
2. Per-page — data loads, filters work, CRUD persists
3. Full workflow — Request → Approve → Manifest → Transfer → Receive
4. Permissions — each role sees only allowed actions
5. Storage — packing slip photo upload

---

## Files to Create

| File | Purpose |
|---|---|
| `frontend/src/lib/supabaseClient.js` | Supabase client singleton |
| `frontend/src/hooks/useAsyncData.js` | Async data loading hook |
| `frontend/src/utils/caseUtils.js` | snake_case ↔ camelCase transforms |
| `frontend/src/services/storageService.js` | Packing slip upload/download |
| `frontend/.env.local` | Supabase credentials (gitignored) |
| ~~`backend/supabase/schema.sql`~~ | ✅ Done — tables, views, triggers, RLS, functions |
| `backend/supabase/seed.sql` | Demo data for all tables |

## Files to Modify

| File | Scope of Change |
|---|---|
| `frontend/src/services/authService.js` | Full rewrite |
| `frontend/src/services/projectService.js` | Full rewrite |
| `frontend/src/services/inventoryService.js` | Full rewrite |
| `frontend/src/services/requestService.js` | Full rewrite |
| `frontend/src/services/manifestService.js` | Full rewrite |
| `frontend/src/services/transferService.js` | Full rewrite |
| `frontend/src/App.jsx` | Async auth, session persistence |
| `frontend/src/components/*Page.jsx` (7 pages) | `useAsyncData` + loading states |
| `frontend/package.json` | Add `@supabase/supabase-js` |
| `.gitignore` | Add `.env.local` |
