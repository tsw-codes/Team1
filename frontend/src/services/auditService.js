import { supabase, USE_MOCK } from "../lib/supabaseClient"
import { snakeToCamel } from "../utils/caseUtils"
import { getAllRequests } from "./requestService"
import { getAllManifests } from "./manifestService"
import { getAllTransfers } from "./transferService"
import { mockInventoryAdjustments } from "../data/mockInventoryAdjustements"

const ACTION_LABELS = {
  request_created: "Request Created",
  request_approved: "Request Approved",
  request_rejected: "Request Rejected",
  manifest_finalized: "Manifest Finalized",
  transfer_shipped: "Transfer Shipped",
  transfer_received: "Transfer Received",
  inventory_adjusted: "Inventory Adjusted",
}

const ACTION_GROUPS = {
  request_created: "Request",
  request_approved: "Request",
  request_rejected: "Request",
  manifest_finalized: "Manifest",
  transfer_shipped: "Transfer",
  transfer_received: "Transfer",
  inventory_adjusted: "Inventory",
}

export function getActionLabel(action) {
  return ACTION_LABELS[action] || action
}

export function getActionGroup(action) {
  return ACTION_GROUPS[action] || "Other"
}

export function getActionBadgeClass(action) {
  switch (action) {
    case "request_approved":
    case "transfer_received":
      return "status-badge available"
    case "request_rejected":
      return "status-badge out-of-stock"
    case "transfer_shipped":
      return "status-badge in-transit"
    case "manifest_finalized":
      return "status-badge reserved"
    case "inventory_adjusted":
      return "status-badge low-stock"
    case "request_created":
    default:
      return "status-badge"
  }
}

async function getAdjustmentsLive() {
  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select(
      "id, inventory_item_id, adjustment_type, quantity_change, previous_quantity, new_quantity, reason, adjusted_by, adjusted_at"
    )
    .order("adjusted_at", { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map(snakeToCamel)
}

function buildEventsFromRequests(requests) {
  const events = []

  for (const request of requests) {
    if (request.createdAt) {
      events.push({
        id: `req-create-${request.id}`,
        at: request.createdAt,
        actor: request.requestedBy || "",
        action: "request_created",
        entityType: "request",
        entityId: request.id,
        summary: request.project || request.location || request.id,
        notes: request.requestNotes || "",
        related: { request },
      })
    }

    if (request.approvedAt) {
      events.push({
        id: `req-approve-${request.id}`,
        at: request.approvedAt,
        actor: request.approvedBy || "",
        action: "request_approved",
        entityType: "request",
        entityId: request.id,
        summary: request.project || request.location || request.id,
        notes: request.approvalNotes || "",
        related: { request },
      })
    }

    if (request.rejectedAt) {
      events.push({
        id: `req-reject-${request.id}`,
        at: request.rejectedAt,
        actor: request.rejectedBy || "",
        action: "request_rejected",
        entityType: "request",
        entityId: request.id,
        summary: request.project || request.location || request.id,
        notes: request.approvalNotes || "",
        related: { request },
      })
    }
  }

  return events
}

function buildEventsFromManifests(manifests) {
  const events = []

  for (const manifest of manifests) {
    if (manifest.finalizedAt) {
      events.push({
        id: `man-final-${manifest.id}`,
        at: manifest.finalizedAt,
        actor: manifest.finalizedBy || manifest.createdBy || "",
        action: "manifest_finalized",
        entityType: "manifest",
        entityId: manifest.id,
        summary: [manifest.sourceLocation, manifest.destinationLocation]
          .filter(Boolean)
          .join(" → "),
        notes: manifest.manifestNotes || "",
        related: { manifest },
      })
    }
  }

  return events
}

function buildEventsFromTransfers(transfers) {
  const events = []

  for (const transfer of transfers) {
    if (transfer.shippedAt) {
      events.push({
        id: `tx-ship-${transfer.id}`,
        at: transfer.shippedAt,
        actor: transfer.shippedBy || "",
        action: "transfer_shipped",
        entityType: "transfer",
        entityId: transfer.id,
        summary: [transfer.sourceLocation, transfer.destinationLocation]
          .filter(Boolean)
          .join(" → "),
        notes: transfer.transferNotes || "",
        related: { transfer },
      })
    }

    if (transfer.receivedAt) {
      const statusValue = transfer.statusValue || transfer.status
      events.push({
        id: `tx-recv-${transfer.id}`,
        at: transfer.receivedAt,
        actor: transfer.receivedBy || "",
        action: "transfer_received",
        entityType: "transfer",
        entityId: transfer.id,
        summary: [transfer.sourceLocation, transfer.destinationLocation]
          .filter(Boolean)
          .join(" → "),
        notes:
          statusValue === "exception"
            ? transfer.exceptionNotes || "Partial receipt"
            : transfer.transferNotes || "",
        statusValue,
        related: { transfer },
      })
    }
  }

  return events
}

function buildEventsFromAdjustments(adjustments) {
  return (adjustments || []).map((adj) => {
    const signedDelta = Number(adj.newQuantity) - Number(adj.previousQuantity)
    const sign = signedDelta > 0 ? "+" : ""
    return {
      id: `adj-${adj.id}`,
      at: adj.adjustedAt,
      actor: adj.adjustedBy || "",
      action: "inventory_adjusted",
      entityType: "inventory_item",
      entityId: String(adj.inventoryItemId),
      summary: `${adj.adjustmentType} ${sign}${signedDelta}`,
      notes: adj.reason || "",
      qtyChange: signedDelta,
      previousQuantity: adj.previousQuantity,
      newQuantity: adj.newQuantity,
      related: { adjustment: adj },
    }
  })
}

export async function getAuditEvents() {
  const [requests, manifests, transfers, adjustments] = await Promise.all([
    getAllRequests(),
    getAllManifests(),
    getAllTransfers(),
    USE_MOCK ? Promise.resolve(mockInventoryAdjustments) : getAdjustmentsLive(),
  ])

  const events = [
    ...buildEventsFromRequests(requests),
    ...buildEventsFromManifests(manifests),
    ...buildEventsFromTransfers(transfers),
    ...buildEventsFromAdjustments(adjustments),
  ]

  events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0
    const tb = b.at ? new Date(b.at).getTime() : 0
    return tb - ta
  })

  return events
}
