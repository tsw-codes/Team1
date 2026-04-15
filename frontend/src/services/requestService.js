import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockRequests, getRequestById } from "../data/mockRequests"
import { createAuditTimestamp } from "../utils/dateUtils"

let listeners = []

export function subscribeToRequests(listener) {
  listeners.push(listener)

  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function notifyRequestChange() {
  listeners.forEach(listener => listener())
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

  const nextNumber = matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

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

/**
 * Fetches a request from Supabase with its nested request_items.
 * Returns the camelCase-converted object with items attached.
 */
async function fetchRequestWithItems(query) {
  const { data, error } = await query.select(`
    *,
    request_items (id, inventory_item_id, requested_quantity)
  `)

  if (error) throw new Error(error.message)
  if (!data) return null

  const rows = Array.isArray(data) ? data : [data]

  return rows.map((row) => {
    const items = row.request_items || []
    const { request_items, ...rest } = row
    const converted = snakeToCamel(rest)
    converted.items = snakeToCamel(items)
    return converted
  })
}

/**
 * Returns all requests.
 */
export async function getAllRequests() {
  if (USE_MOCK) return mockRequests

  const results = await fetchRequestWithItems(
    supabase.from('requests_view').order('created_at', { ascending: false })
  )
  return results
}

/**
 * Returns requests with status "pending_approval".
 */
export async function getRequestsPendingApproval() {
  if (USE_MOCK) {
    return mockRequests.filter(
      (request) => (request.statusValue || request.status) === "pending_approval"
    )
  }

  const results = await fetchRequestWithItems(
    supabase.from('requests_view').eq('status_value', 'pending_approval').order('created_at', { ascending: false })
  )
  return results
}

/**
 * Returns requests with status "approved".
 */
export async function getApprovedRequests() {
  if (USE_MOCK) {
    return mockRequests.filter(
      (request) => (request.statusValue || request.status) === "approved"
    )
  }

  const results = await fetchRequestWithItems(
    supabase.from('requests_view').eq('status_value', 'approved').order('created_at', { ascending: false })
  )
  return results
}

/**
 * Finds a single request by ID.
 */
export async function findRequestById(id) {
  if (USE_MOCK) return getRequestById(id)

  const results = await fetchRequestWithItems(
    supabase.from('requests_view').eq('id', id)
  )
  return results?.[0] || null
}

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
  if (USE_MOCK) {
    const result = updateRequest(id, {
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

  const result = await updateRequest(id, {
    statusValue: "approved",
    approvedBy,
    approvedAt: new Date().toISOString(),
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
  if (USE_MOCK) {
    const result = updateRequest(id, {
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

  const result = await updateRequest(id, {
    statusValue: "rejected",
    approvedBy: null,
    approvedAt: null,
    rejectedBy,
    rejectedAt: new Date().toISOString(),
    approvalNotes,
  })

  notifyRequestChange()
  return result
}
