# Services API Reference

All service functions are **async** and return **camelCase** objects. You never need to import or know about Supabase — just call these functions and get data back.

When `VITE_USE_MOCK=true` (the default), services return mock data. When `VITE_USE_MOCK=false`, they hit the live Supabase database.

---

## Loading Data in Pages

Use the `useAsyncData` hook for any data that loads on mount:

```jsx
import { useAsyncData } from '../hooks/useAsyncData'
import { getAllRequests } from '../services/requestService'

function MyPage() {
  const { data: requests, loading, error, refetch } = useAsyncData(getAllRequests)

  if (loading) return <Spinner />
  if (error) return <ErrorMessage message={error.message} />

  return <RequestTable data={requests ?? []} />
}
```

For actions (create, update, approve), call the service directly in your handler:

```jsx
async function handleApprove(id) {
  await approveRequest(id, currentUser.username, notes)
  refetch() // reload the list
}
```

---

## authService.js

Authentication and user profile management.

| Function | Params | Returns | Description |
|---|---|---|---|
| `authenticateUser` | `(username, password)` | `{ id, username, name, role }` or `null` | Log in. Converts username to email internally |
| `findUserById` | `(id)` | `{ id, username, name, role }` or `null` | Look up a user profile by UUID |
| `findUserByUsername` | `(username)` | `{ id, username, name, role }` or `null` | Look up a user profile by username |
| `updateUserPassword` | `(userId, currentPassword, newPassword)` | profile object or `null` | Verifies current password, then updates. Returns `null` if current password is wrong |
| `signOut` | `()` | `void` | Ends the session |
| `getCurrentSession` | `()` | profile object or `null` | Restores login on page refresh (checks for existing session) |
| `onAuthStateChange` | `(callback)` | unsubscribe `function` | Listens for token refresh, expiry, sign out. Callback receives event string |

**Demo accounts (Supabase mode):**

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `pm` | `pm123` | Project Manager |
| `wm` | `wm123` | Warehouse Manager |
| `la` | `la123` | Logistics Associate |
| `lf` | `lf123` | Logistics Foreman |

---

## projectService.js

Locations and projects (reference data used by most other pages).

| Function | Params | Returns | Description |
|---|---|---|---|
| `getLocationOptions` | `()` | `[{ value, label }]` | All locations for dropdowns |
| `getLocationByValue` | `(value)` | `{ value, label, type, projects }` or `null` | Single location with its projects |
| `getProjectOptionsForLocation` | `(locationValue)` | `[{ value, label }]` | Projects under a location |
| `getProjectByValue` | `(projectValue)` | `{ value, label }` or `null` | Single project lookup |
| `getLocationOptionsForPermissions` | `(permissions)` | `[{ value, label, type }]` | Locations filtered by receive permissions |
| `getSiteLocationOptions` | `()` | `[{ value, label, type }]` | All job site locations |
| `getWarehouseLocationOptions` | `()` | `[{ value, label, type }]` | All warehouse locations |

---

## inventoryService.js

Inventory items, filters, summaries, and adjustments.

| Function | Params | Returns | Description |
|---|---|---|---|
| `getAllInventory` | `()` | `[item]` | All inventory items |
| `getInventoryItems` | `()` | `[item]` | Alias for `getAllInventory` |
| `getRequestableInventory` | `()` | `[item]` | Warehouse-only items (for material requests) |
| `getRequestableInventoryForWarehouse` | `(sourceWarehouseValue)` | `[item]` | Items at a specific warehouse |
| `findRequestableInventoryItemById` | `(id)` | `item` or `null` | Single warehouse item by ID |
| `findInventoryItemById` | `(id)` | `item` or `null` | Any item by ID |
| `getInventoryFilterOptions` | `()` | `{ projects, categories, statuses }` | Unique values for filter dropdowns (each array starts with `"All"`) |
| `getInventorySummary` | `()` | `{ totalItems, lowStock, outOfStock, inTransit }` | Counts by status |
| `getInventoryForReturnSource` | `(sourceLocationValue)` | `[item]` | Items at a site (for return manifests) |
| `getInventoryForWarehouseSource` | `(sourceLocationValue)` | `[item]` | Items at a warehouse (for warehouse transfer manifests) |
| `getManualSourceInventory` | `(manifestMode, sourceLocation)` | `[item]` | Picks the right source inventory based on manifest mode |
| `createInventoryAdjustment` | `({ inventoryItemId, adjustmentType, quantityValue, reason, adjustedBy, permissions })` | `{ updatedItem, adjustmentRecord }` or `null` | Adjusts quantity. Types: `"increase"`, `"decrease"`, `"set"`. Returns null if no permission or invalid input |
| `canAdjustInventoryItemForPermissions` | `(item, permissions)` | `boolean` | Checks if user can adjust this item (based on location type) |

**Inventory item shape:**
```js
{
  id, name, sku, quantity, unit, category, status,
  locationValue, location, locationDetail,
  project, unitCost, totalCost, updatedAt
}
```

---

## requestService.js

Material requests (Request → Approve/Reject workflow).

| Function | Params | Returns | Description |
|---|---|---|---|
| `getAllRequests` | `()` | `[request]` | All requests, newest first |
| `getRequestsPendingApproval` | `()` | `[request]` | Only `pending_approval` requests |
| `getApprovedRequests` | `()` | `[request]` | Only `approved` requests |
| `findRequestById` | `(id)` | `request` or `null` | Single request by ID |
| `createRequest` | `(newRequest)` | `request` | Creates a request with items. Status defaults to `pending_approval` |
| `updateRequest` | `(id, updates)` | `request` or `null` | Updates request fields |
| `approveRequest` | `(id, approvedBy, approvalNotes?)` | `request` | Sets status to `approved`, records who and when |
| `rejectRequest` | `(id, rejectedBy, approvalNotes?)` | `request` | Sets status to `rejected`, records who and when |
| `subscribeToRequests` | `(listener)` | unsubscribe `function` | Notifies when requests change (for cross-page updates) |

**Request shape:**
```js
{
  id,              // "RQ-1001"
  statusValue,     // "pending_approval" | "approved" | "rejected"
  status,          // "Pending Approval" | "Approved" | "Rejected"
  priorityValue, priority,
  locationValue, location, locationType,
  projectValue, project,
  sourceWarehouseValue, sourceWarehouse,
  deliveryLocationText,
  requestedBy, createdAt,
  approvedBy, approvedAt,
  rejectedBy, rejectedAt,
  approvalNotes,
  items: [{ id, inventoryItemId, requestedQuantity }]
}
```

---

## manifestService.js

Manifests (packing lists created from approved requests or manually).

| Function | Params | Returns | Description |
|---|---|---|---|
| `getAllManifests` | `()` | `[manifest]` | All manifests, newest first |
| `findManifestById` | `(id)` | `manifest` or `null` | Single manifest by ID |
| `getAllowedManifestModes` | `(permissions)` | `["outbound", "return", ...]` | Which manifest types the user's role allows |
| `getAvailableManifestsForTransfer` | `(permissions)` | `[manifest]` | Finalized manifests the user can create transfers from |
| `createManifest` | `(newManifest)` | `manifest` | Creates manifest with items |
| `updateManifest` | `(id, updates)` | `manifest` or `null` | Updates manifest fields |

**Manifest shape:**
```js
{
  id,                   // "MO-1001", "MR-1001", "MW-1001"
  manifestTypeValue,    // "outbound" | "return" | "warehouse_transfer"
  manifestType,         // "Outbound" | "Return" | "Warehouse Transfer"
  statusValue,          // "finalized"
  status,               // "Finalized"
  requestId,
  sourceLocationValue, sourceLocation,
  destinationLocationValue, destinationLocation,
  createdBy, createdAt,
  finalizedBy, finalizedAt,
  items: [{ id, inventoryItemId, name, sku, unit, manifestQuantity }]
}
```

---

## transferService.js

Transfers (ship and receive inventory between locations).

| Function | Params | Returns | Description |
|---|---|---|---|
| `getAllTransfers` | `()` | `[transfer]` | All transfers, newest first |
| `findTransferById` | `(id)` | `transfer` or `null` | Single transfer by ID |
| `getTransfersForPermissions` | `(permissions)` | `[transfer]` | Active transfers (`ready_to_ship` or `in_transit`) the user can act on |
| `createTransfer` | `(newTransfer)` | `transfer` | Creates transfer with items from a manifest |
| `updateTransfer` | `(id, updates)` | `transfer` or `null` | Updates transfer fields and/or item quantities |
| `deleteTransfer` | `(id)` | `true` or `null` | Deletes a transfer |

**Transfer shape:**
```js
{
  id,                     // "TO-1001", "TR-1001", "TW-1001"
  transferTypeValue,      // "outbound" | "return" | "warehouse_transfer"
  transferType,           // "Outbound" | "Return" | "Warehouse Transfer"
  statusValue,            // "ready_to_ship" | "in_transit" | "completed" | "exception"
  status,                 // "Ready to Ship" | "In Transit" | "Completed" | "Exception"
  completionOutcomeValue, // "full_match" | "partial_match" | "mismatch" | null
  completionOutcome,      // display label or null
  manifestId,
  sourceLocationValue, sourceLocation,
  destinationLocationValue, destinationLocation,
  createdBy, createdAt,
  shippedBy, shippedAt,
  receivedBy, receivedAt,
  exceptionNotes,
  items: [{
    id, inventoryItemId, name, sku, unit,
    manifestQuantity, shippedQuantity, receivedQuantity, varianceReason
  }]
}
```

**Status transitions (enforced by DB):**
```
ready_to_ship → in_transit → completed
                           → exception → completed
```

---

## Workflow Summary

```
Request (pending_approval)
  → approved / rejected

Manifest (finalized)
  ← created from approved request (outbound)
  ← created manually (return, warehouse_transfer)

Transfer (ready_to_ship → in_transit → completed/exception)
  ← created from finalized manifest
  → shipping decreases source inventory (auto)
  → receiving increases destination inventory (auto)
```
