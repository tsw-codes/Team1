import { mockRequests } from "../data/mockRequests"
import { createAuditTimestamp } from "../utils/dateUtils"
import { findInventoryItemById } from "./inventoryService"

let listeners = []

const requestDataSource = {
  getAll() {
    return mockRequests
  },

  findById(id) {
    return mockRequests.find((request) => request.id === id) || null
  },

  insert(request) {
    mockRequests.unshift(request)
    return request
  },

  replaceById(id, updatedRequest) {
    const index = mockRequests.findIndex((request) => request.id === id)

    if (index === -1) return null

    mockRequests[index] = updatedRequest
    return mockRequests[index]
  },
}

export function subscribeToRequests(listener) {
  listeners.push(listener)

  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function notifyRequestChange() {
  listeners.forEach((listener) => listener())
}

function generateRequestId() {
  const prefix = "RQ"

  const matchingIds = requestDataSource
    .getAll()
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

export function buildRequestItemsWithCost(request) {
  if (!request) return []

  return request.items.map((item) => {
    const inventoryItem = findInventoryItemById(item.inventoryItemId)

    const requestedQuantity = Number(item.requestedQuantity || 0)
    const unitCost = Number(inventoryItem?.unitCost || 0)
    const lineTotalCost = requestedQuantity * unitCost

    return {
      ...item,
      name: inventoryItem?.name || `Inventory Item ${item.inventoryItemId}`,
      sku: inventoryItem?.sku || "",
      unit: inventoryItem?.unit || "",
      category: inventoryItem?.category || "",
      unitCost,
      lineTotalCost,
    }
  })
}

export function getAllRequests() {
  return requestDataSource.getAll()
}

export function getRequestsPendingApproval() {
  return requestDataSource.getAll().filter(
    (request) => (request.statusValue || request.status) === "pending_approval"
  )
}

export function getPendingRequestCount() {
  return requestDataSource.getAll().filter(
    (request) => (request.statusValue || request.status) === "pending_approval"
  ).length
}

export function getApprovedRequests() {
  return requestDataSource.getAll().filter(
    (request) => (request.statusValue || request.status) === "approved"
  )
}

export function findRequestById(id) {
  return requestDataSource.findById(id)
}

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

export function createRequest(newRequest) {
  const requestWithId = normalizeRequest({
    ...newRequest,
    id: generateRequestId(),
    createdAt: newRequest.createdAt || createAuditTimestamp(),
    statusValue: newRequest.statusValue || "pending_approval",
    status: newRequest.status || "Pending Approval",
  })

  const createdRequest = requestDataSource.insert(requestWithId)
  notifyRequestChange()
  return createdRequest
}

export function updateRequest(id, updates) {
  const existingRequest = requestDataSource.findById(id)
  if (!existingRequest) return null

  const updatedRequest = normalizeRequest({
    ...existingRequest,
    ...updates,
  })

  return requestDataSource.replaceById(id, updatedRequest)
}

export function approveRequest(id, approvedBy, approvalNotes = "") {
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

export function rejectRequest(id, rejectedBy, approvalNotes = "") {
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