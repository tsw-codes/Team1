import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockRequests } from "../data/mockRequests"
import { createAuditTimestamp } from "../utils/dateUtils"

let listeners = []

export function subscribeToRequests(listener) {
  listeners.push(listener)

  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function notifyRequestChange() {
  listeners.forEach((listener) => listener())
}

// --- Mock-only helpers ---

function generateRequestId() {
  const prefix = "RQ"

  const matchingIds = mockRequests
    .filter((request) => request.id.startsWith(`${prefix}-`))
    .map((request) => {
      const numericPart = Number(request.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

function normalizeRequest(record) {
  return {
    ...record,
    statusValue: record.statusValue || "pending_approval",
    status: record.status || "Pending Approval",

    priorityValue: record.priorityValue || "",
    priority: record.priority || "",

    locationValue: record.locationValue || "",
    location: record.location || "",
    locationType: record.locationType || "",

    projectValue: record.projectValue || "",
    project: record.project || "",

    sourceWarehouseValue: record.sourceWarehouseValue || "",
    sourceWarehouse: record.sourceWarehouse || "",

    deliveryLocationText: record.deliveryLocationText || "",

    approvedBy: record.approvedBy ?? null,
    approvedAt: record.approvedAt ?? null,

    rejectedBy: record.rejectedBy ?? null,
    rejectedAt: record.rejectedAt ?? null,

    approvalNotes: record.approvalNotes || "",

    items: Array.isArray(record.items) ? record.items : [],
  }
}

const REQUEST_SELECT = '*, request_items (id, inventory_item_id, requested_quantity, inventory_items (name, sku, unit, unit_cost))'

function mapRequestRows(data) {
  if (!data) return []
  const rows = Array.isArray(data) ? data : [data]

  return rows.map((row) => {
    const rawItems = row.request_items || []
    const { request_items, ...rest } = row
    const converted = snakeToCamel(rest)
    converted.items = rawItems.map((item) => {
      const inv = item.inventory_items || {}
      return {
        id: item.id,
        inventoryItemId: item.inventory_item_id,
        requestedQuantity: item.requested_quantity,
        name: inv.name || '',
        sku: inv.sku || '',
        unit: inv.unit || '',
        unitCost: Number(inv.unit_cost || 0),
      }
    })
    return converted
  })
}

/* =========================
   FORM HELPERS (pure, work in any mode)
========================= */

/**
 * Builds a normalized request payload from form state.
 */
export function buildRequestPayload({
  requestForm,
  requestedItems,
  selectedLocationLabel = "",
  selectedLocationType = "",
  selectedProjectLabel = "",
  selectedSourceWarehouseLabel = "",
}) {
  const priorityLabelMap = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  }

  return {
    requestedBy: requestForm.requestedBy,
    createdAt: requestForm.createdAt,

    statusValue: "pending_approval",
    status: "Pending Approval",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    locationValue: requestForm.locationValue,
    location: selectedLocationLabel,
    locationType: selectedLocationType,

    projectValue: requestForm.projectValue,
    project: selectedProjectLabel,

    neededByDate: requestForm.neededByDate,

    priorityValue: requestForm.priorityValue,
    priority: priorityLabelMap[requestForm.priorityValue] || "",

    sourceWarehouseValue: requestForm.sourceWarehouseValue,
    sourceWarehouse: selectedSourceWarehouseLabel,

    deliveryLocationText: requestForm.deliveryLocationText.trim(),

    notes: requestForm.notes,

    items: requestedItems.map((item, index) => ({
      id: index + 1,
      inventoryItemId: Number(item.inventoryItemId),
      requestedQuantity: Number(item.requestedQuantity),
    })),
  }
}

/**
 * Enriches a request's items with computed cost fields.
 * Item name/sku/unit/unitCost are already loaded via the JOIN in REQUEST_SELECT.
 */
export function buildRequestItemsWithCost(request) {
  if (!request) return []

  return request.items.map((item) => {
    const requestedQuantity = Number(item.requestedQuantity || 0)
    const unitCost = Number(item.unitCost || 0)
    const lineTotalCost = requestedQuantity * unitCost

    return {
      ...item,
      lineTotalCost,
    }
  })
}

/* =========================
   READ FUNCTIONS
========================= */

export async function getAllRequests() {
  if (USE_MOCK) return mockRequests

  const { data, error } = await supabase
    .from('requests_view')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapRequestRows(data)
}

export async function getRequestsPendingApproval() {
  if (USE_MOCK) {
    return mockRequests.filter(
      (request) => (request.statusValue || request.status) === "pending_approval"
    )
  }

  const { data, error } = await supabase
    .from('requests_view')
    .select(REQUEST_SELECT)
    .eq('status_value', 'pending_approval')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapRequestRows(data)
}

export async function getPendingRequestCount() {
  const pending = await getRequestsPendingApproval()
  return pending.length
}

export async function getApprovedRequests() {
  if (USE_MOCK) {
    return mockRequests.filter(
      (request) => (request.statusValue || request.status) === "approved"
    )
  }

  const { data, error } = await supabase
    .from('requests_view')
    .select(REQUEST_SELECT)
    .eq('status_value', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapRequestRows(data)
}

export async function findRequestById(id) {
  if (USE_MOCK) {
    return mockRequests.find((request) => request.id === id) || null
  }

  const { data, error } = await supabase
    .from('requests_view')
    .select(REQUEST_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  return mapRequestRows(data)?.[0] || null
}

/* =========================
   WRITE FUNCTIONS
========================= */

/**
 * Creates a new material request with its line items.
 * Expects camelCase input matching the mock data shape.
 */
export async function createRequest(newRequest) {
  if (USE_MOCK) {
    const requestWithId = normalizeRequest({
      ...newRequest,
      id: generateRequestId(),
      createdAt: newRequest.createdAt || createAuditTimestamp(),
      statusValue: newRequest.statusValue || "pending_approval",
      status: newRequest.status || "Pending Approval",
    })

    mockRequests.unshift(requestWithId)
    notifyRequestChange()
    return requestWithId
  }

  const { items, ...requestFields } = newRequest
  const snakeFields = camelToSnake(requestFields)

  // Remove display-only fields that don't exist on the requests table
  delete snakeFields.status
  delete snakeFields.priority
  delete snakeFields.location
  delete snakeFields.project
  delete snakeFields.source_warehouse

  // Generate ID from DB function
  const { data: generatedId, error: idError } = await supabase
    .rpc('generate_request_id')

  if (idError) throw new Error(idError.message)
  snakeFields.id = generatedId

  const { data: request, error } = await supabase
    .from('requests')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Insert request items
  if (items && items.length > 0) {
    const itemRows = items.map((item) => ({
      request_id: request.id,
      inventory_item_id: item.inventoryItemId,
      requested_quantity: item.requestedQuantity,
    }))

    const { error: itemsError } = await supabase
      .from('request_items')
      .insert(itemRows)

    if (itemsError) throw new Error(itemsError.message)
  }

  // Re-fetch from view to get joined labels
  const created = await findRequestById(request.id)
  notifyRequestChange()
  return created
}

/**
 * Updates a request's fields by ID.
 */
export async function updateRequest(id, updates) {
  if (USE_MOCK) {
    const index = mockRequests.findIndex((request) => request.id === id)
    if (index === -1) return null

    mockRequests[index] = normalizeRequest({
      ...mockRequests[index],
      ...updates,
    })

    return mockRequests[index]
  }

  const snakeUpdates = camelToSnake(updates)

  // Remove display-only fields
  delete snakeUpdates.status
  delete snakeUpdates.priority
  delete snakeUpdates.location
  delete snakeUpdates.project
  delete snakeUpdates.source_warehouse
  delete snakeUpdates.items

  const { error } = await supabase
    .from('requests')
    .update(snakeUpdates)
    .eq('id', id)

  if (error) throw new Error(error.message)

  return findRequestById(id)
}

/**
 * Approves a request. DB triggers enforce workflow rules.
 */
export async function approveRequest(id, approvedBy, approvalNotes = "") {
  const result = await updateRequest(id, {
    statusValue: "approved",
    status: "Approved",
    approvedBy,
    approvedAt: createAuditTimestamp(),
    rejectedBy: null,
    rejectedAt: null,
    approvalNotes,
  })

  notifyRequestChange()
  return result
}

/**
 * Rejects a request. DB triggers enforce workflow rules.
 */
export async function rejectRequest(id, rejectedBy, approvalNotes = "") {
  const result = await updateRequest(id, {
    statusValue: "rejected",
    status: "Rejected",
    approvedBy: null,
    approvedAt: null,
    rejectedBy,
    rejectedAt: createAuditTimestamp(),
    approvalNotes,
  })

  notifyRequestChange()
  return result
}
