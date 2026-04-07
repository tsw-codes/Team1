import { mockRequests, getRequestById } from "../data/mockRequests"
import { createAuditTimestamp } from "../utils/dateUtils"

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
    statusValue: record.statusValue || "pending",
    status: record.status || "Pending",
    priorityValue: record.priorityValue || "",
    priority: record.priority || "",
    locationValue: record.locationValue || "",
    location: record.location || "",
    projectValue: record.projectValue || "",
    project: record.project || "",
    sourceWarehouseValue: record.sourceWarehouseValue || "",
    sourceWarehouse: record.sourceWarehouse || "",
    deliveryLocationText: record.deliveryLocationText || "",
    items: Array.isArray(record.items) ? record.items : [],
  }
}

export function getAllRequests() {
  return mockRequests
}

export function getPendingRequests() {
  return mockRequests.filter((request) => request.statusValue === "pending")
}

export function findRequestById(id) {
  return getRequestById(id)
}

export function createRequest(newRequest) {
  const requestWithId = normalizeRequest({
    ...newRequest,
    id: generateRequestId(),
    createdAt: newRequest.createdAt || createAuditTimestamp(),
  })

  mockRequests.unshift(requestWithId)
  return requestWithId
}

export function updateRequest(id, updates) {
  const index = mockRequests.findIndex((request) => request.id === id)

  if (index === -1) return null

  mockRequests[index] = normalizeRequest({
    ...mockRequests[index],
    ...updates,
  })

  return mockRequests[index]
}