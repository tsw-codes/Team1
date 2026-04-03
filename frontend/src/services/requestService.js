import { mockRequests, pendingRequests, getRequestById } from "../data/mockRequests"
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

export function getAllRequests() {
  return mockRequests
}

export function getPendingRequests() {
  return pendingRequests
}

export function findRequestById(id) {
  return getRequestById(id)
}

export function createRequest(newRequest) {
  const requestWithId = {
    ...newRequest,
    id: generateRequestId(),
    createdAt: newRequest.createdAt || createAuditTimestamp(),
    status: newRequest.status || "Pending",
  }

  mockRequests.unshift(requestWithId)
  return requestWithId
}

export function updateRequest(id, updates) {
  const index = mockRequests.findIndex((request) => request.id === id)

  if (index === -1) return null
  
  mockRequests[index] = {
    ...mockRequests[index],
    ...updates,
  }

  return mockRequests[index]
}