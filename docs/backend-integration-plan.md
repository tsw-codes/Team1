# MEC2 Inventory System — Supabase Backend Integration Plan

## Context

The frontend is ~90% complete with mock data. A separate team member works on the UI. We need to integrate Supabase as the backend without breaking existing page components. The services layer (`frontend/src/services/`) is the integration point — we rewrite service internals while keeping the same function signatures (made async).

### Working Principles

1. **Edge cases first** — before implementing any feature, we identify and plan for edge cases. No coding until we've thought through failure modes, permission gaps, and data integrity issues.
2. **Plug-and-play for frontend devs** — teammates who don't know Supabase should never need to learn it. They call clean service functions and get data back. Supabase is an implementation detail hidden behind the services layer.
3. **Clear error messages** — all DB trigger errors and service errors must be human-readable. Frontend devs should be able to display them directly in a toast.

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
│  │  ── Validation Triggers ───────────────────────────────   │   │
│  │  Workflow state transitions, role-type checks,            │   │
│  │  inventory auto-adjustment on ship/receive                │   │
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
│                    LAYER 2: Supabase RLS + Triggers (DB)     │
│                                                              │
│   RLS policies on each table (role-based)                    │
│   Validation triggers (operation-type-based)                 │
│   Enforced at the database level — cannot be bypassed        │
│   This controls WHAT THE USER CAN ACTUALLY DO                │
│                                                              │
│   Example: even if someone crafts a direct API call,         │
│   RLS + triggers block unauthorized operations               │
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
│  │  • HOW (adjustment_type: increase/decrease/set/returned) │   │
│  │  • BY HOW MUCH (previous_qty → new_qty, qty_change)      │   │
│  │  • WHY (reason: free text or auto-generated)             │   │
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
              └──► inventory_items qty updated (auto-trigger)
                   └──► inventory_adjustments logged (auto-trigger)
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

### Plug-and-Play Contract

```
WHAT FRONTEND DEVS SEE          WHAT THEY DON'T SEE
──────────────────────           ─────────────────────
import { getAllRequests }        supabase.from(...)
  from '../services/             .select(...)
   requestService'               .eq(...)
                                 snakeToCamel(...)
const requests =
  await getAllRequests()         // returns [{id, statusValue,
                                //   location, items, ...}]
```

Rules for the services layer:
- All functions are async, return camelCase objects
- All Supabase imports stay inside service files
- Error handling is done inside services — throw with clear messages
- Frontend devs never need to know Supabase exists

### Error Handling Pattern

```js
// Inside service (what frontend devs DON'T write)
export async function getAllRequests() {
  const { data, error } = await supabase
    .from('requests_view')
    .select('*, request_items(*)')

  if (error) throw new Error(`Failed to load requests: ${error.message}`)
  return data.map(snakeToCamel)
}

// In page component (what frontend devs DO write)
const { data, loading, error } = useAsyncData(getAllRequests)

if (loading) return <Spinner />
if (error) return <ErrorMessage message={error.message} />
// ...render normally
```

---

## Edge Cases & Data Integrity

These are addressed **during** each step before we write code, not as a separate phase.

### Workflow enforcement ✅ DONE (in schema.sql)
DB triggers enforce: Request (approved) → Manifest (finalized) → Transfer (ready_to_ship → in_transit → completed/exception). Invalid state transitions are blocked with clear error messages.

### Role enforcement at the database level ✅ DONE (in schema.sql)
DB triggers check the user's role against the operation type:
- **Requests**: only logisticsForeman + admin can INSERT
- **Approve/Reject**: only projectManager + admin can UPDATE request status
- **Outbound manifests**: only warehouseManager + admin
- **Return manifests**: only logisticsAssociate + logisticsForeman + admin
- **Warehouse transfer manifests**: only warehouseManager + admin
- **Ship outbound/return**: only logisticsAssociate + logisticsForeman + admin
- **Ship warehouse transfer**: only warehouseManager + admin
- **Receive at site**: only logisticsAssociate + logisticsForeman + admin
- **Receive at warehouse**: only warehouseManager + admin
- **Adjust warehouse inventory**: only warehouseManager + admin
- **Adjust site inventory**: only logisticsAssociate + logisticsForeman + admin
- **Admin bypasses all role checks** but NOT workflow state transitions

### Inventory auto-adjustment ✅ DONE (in schema.sql)
DB triggers on transfer status change:
- **On ship** (→ in_transit) — source location quantities decrease
- **On receive** (→ completed/exception) — destination quantities increase by received amount
- All auto-adjustments logged in `inventory_adjustments` with clear reasons

### Per-step edge cases (address as we build each service)
- **Auth**: token expiry mid-session, password change invalidating session, duplicate logins
- **Inventory**: adjusting an item that's "In Transit", concurrent adjustments to same item, quantity going negative
- **Requests**: editing a request after approval, requesting more than available stock, duplicate requests
- **Manifests**: manifesting more than requested, source warehouse doesn't have stock, request rejected after manifest created
- **Transfers**: shipping more than manifested, receiving more than shipped, double-receiving same transfer, network failure mid-receive
- **Storage**: upload fails halfway, oversized files, wrong file types

---

## Implementation Phases

### Phase 1: Supabase Project + Client Setup ✅ DONE
1. ✅ Created Supabase project "MEC2 Inventory" (us-east-1, ref: utxzjalyxcgbqheciyzh)
2. ✅ Installed `@supabase/supabase-js` v2.103.0
3. ✅ Created `frontend/src/lib/supabaseClient.js` — lazy init (only creates client when `VITE_USE_MOCK=false`)
4. ✅ Created `frontend/.env.example` (committed) + `frontend/.env.local` (gitignored)
5. ✅ Created `frontend/src/hooks/useAsyncData.js` — loading/error/refetch hook
6. ✅ Created `frontend/src/utils/caseUtils.js` — recursive snake/camel transforms
7. ✅ Ran all SQL files (01-05 + seed) on live Supabase project
8. ✅ Created 5 demo auth users with auto-created profiles
9. ✅ Added `backend/README.md` with setup instructions for teammates

**Decisions made:**
- Default to `VITE_USE_MOCK=true` so teammates can run without Supabase credentials
- `supabaseClient.js` exports `null` in mock mode — prevents SDK init errors without credentials
- Exports `USE_MOCK` flag for services to check
- Profile trigger needed `SET search_path = public` and `NULLIF` for empty metadata to work correctly
- `create-demo-users.mjs` uses raw fetch to Supabase auth admin API (no extra dependencies)
- Demo passwords are `username + 123` (e.g. admin123, pm123) instead of matching the mock passwords
- Supabase CLI `.temp` directory gitignored at root

### Phase 2: Database Schema ✅ DONE
SQL files live in `backend/supabase/`.
- `schema.sql` — ✅ all tables, views, triggers, RLS policies, ID generation functions, atomic inventory adjustment RPC, workflow validation triggers, role-type validation triggers, and inventory auto-adjustment triggers
- `seed.sql` — ✅ demo data from existing mock files (7 locations, 9 projects, 11 inventory items, 12 requests, 4 manifests, 4 transfers, all with line items). Added missing MO-1002 manifest that transfer TO-1003 references.

**Decisions made:**
- `total_cost` uses a trigger instead of `GENERATED ALWAYS AS` (Supabase tooling compatibility issue)
- `order_date` added to requests table (stakeholder request for PO fallback)
- `returned` added as inventory adjustment type (wrong inventory flow from 03/03 meeting)
- Original `createAll.sql` kept in `backend/SQL scripts/` but marked deprecated
- `@supabase/supabase-js` latest stable is v2.103.0 — no v3 migration needed
- Workflow enforcement via DB triggers (request→manifest→transfer state machine)
- Role-type validation via DB triggers (manifest type and transfer type matched against user role)
- Inventory auto-adjusts on ship (decrease source) and receive (increase destination by received amount)
- All DB error messages are human-readable for frontend toast display
- Admin bypasses role checks but NOT workflow state transitions (data integrity)

### Phase 3: Frontend Utilities ✅ DONE (included in Phase 1)

### Phase 4: Service Rewrites (in dependency order)
1. ✅ `authService.js` + `App.jsx` auth flow
2. ✅ `projectService.js` (locations/projects — referenced by everything)
3. ✅ `inventoryService.js`
4. ✅ `requestService.js`
5. ✅ `manifestService.js`
6. ✅ `transferService.js`
7. `storageService.js` (new — packing slip uploads)

**Auth rewrite decisions:**
- All service functions async with `USE_MOCK` toggle — mock mode returns same data, Supabase mode hits real DB
- Username → email conversion (`admin` → `admin@coolsys.com`) happens inside `authenticateUser()`
- `signOut()`, `getCurrentSession()`, `onAuthStateChange()` added as new exports
- `updateUserPassword()` now takes `currentPassword` param — verifies via `signInWithPassword` before updating
- App.jsx: `useEffect` restores session on refresh, `onAuthStateChange` listener redirects on token expiry
- Password removed from `currentUser` state entirely in Supabase mode
- Mock mode passwords kept as-is (`admin`/`admin`) — Supabase passwords are `username + 123`

### Phase 5: Page Updates (minimal)
- Add `useAsyncData` + loading/error states to 7 pages
- Make submit handlers async

### Phase 6: Verification
1. Auth — login/logout all 5 users, session persistence, token expiry
2. Per-page — data loads, filters work, CRUD persists
3. Full workflow — Request → Approve → Manifest → Transfer → Receive
4. Permissions — each role sees only allowed actions
5. Storage — packing slip photo upload
6. Error handling — disconnect network, verify graceful messages
7. RLS — attempt unauthorized ops via console, verify blocked

---

## Deferred / Future Work

- **PM email notifications** when material arrives at site (Supabase Edge Function + DB trigger on transfer completion)
- **Admin pages** — Manage Users (req 4.6.1) and Manage Locations (req 4.6.2) — need frontend pages built
- **Warehouse bins** — William likes the idea, schema can accommodate later
- **OCR packing slips** — deprecated in SRS for now
- **Deployment** — Netlify env vars for Supabase credentials

---

## Files to Create

| File | Purpose |
|---|---|
| ~~`frontend/src/lib/supabaseClient.js`~~ | ✅ Done |
| ~~`frontend/src/hooks/useAsyncData.js`~~ | ✅ Done |
| ~~`frontend/src/utils/caseUtils.js`~~ | ✅ Done |
| `frontend/src/services/storageService.js` | Packing slip upload/download |
| `frontend/src/services/README.md` | Service API docs for frontend devs |
| ~~`frontend/.env.local`~~ | ✅ Done |
| ~~`frontend/.env.example`~~ | ✅ Done |
| ~~`backend/supabase/schema.sql`~~ | ✅ Done (split into 01-05) |
| ~~`backend/supabase/seed.sql`~~ | ✅ Done |
| ~~`backend/supabase/create-demo-users.mjs`~~ | ✅ Done |
| ~~`backend/README.md`~~ | ✅ Done |

## Files to Modify

| File | Scope of Change |
|---|---|
| ~~`frontend/src/services/authService.js`~~ | ✅ Done |
| ~~`frontend/src/services/projectService.js`~~ | ✅ Done |
| ~~`frontend/src/services/inventoryService.js`~~ | ✅ Done |
| ~~`frontend/src/services/requestService.js`~~ | ✅ Done |
| ~~`frontend/src/services/manifestService.js`~~ | ✅ Done |
| ~~`frontend/src/services/transferService.js`~~ | ✅ Done |
| ~~`frontend/src/App.jsx`~~ | ✅ Done — async auth, session persistence |
| `frontend/src/components/*Page.jsx` (7 pages) | `useAsyncData` + loading/error states |
| ~~`frontend/package.json`~~ | ✅ Done — added `@supabase/supabase-js` |
| ~~`.gitignore`~~ | ✅ Done — added `.env.local`, Supabase CLI `.temp` |
