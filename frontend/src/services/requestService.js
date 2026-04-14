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

export function getAllRequests() {
  return mockRequests
}

export function getRequestsPendingApproval() {
  return mockRequests.filter(
    (request) => (request.statusValue || request.status) === "pending_approval"
  )
}

export function getApprovedRequests() {
  return mockRequests.filter(
    (request) => (request.statusValue || request.status) === "approved"
  )
}

export function findRequestById(id) {
  return getRequestById(id)
}

export function createRequest(newRequest) {
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

export function updateRequest(id, updates) {
  const index = mockRequests.findIndex((request) => request.id === id)

  if (index === -1) return null

  mockRequests[index] = normalizeRequest({
    ...mockRequests[index],
    ...updates,
  })

  return mockRequests[index]
}

export function approveRequest(id, approvedBy, approvalNotes = "") {
  const result =  updateRequest(id, {
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
  const result =  updateRequest(id, {
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