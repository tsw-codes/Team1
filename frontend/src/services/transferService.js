import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockTransfers, getTransferById } from "../data/mockTransfers"

const transferPermissionMap = {
    outbound: "transfer_to_job_site",
    return: "transfer_to_warehouse",
    warehouse_transfer: "transfer_to_warehouse",
}

const ACTIVE_STATUSES = ["ready_to_ship", "in_transit"]

// --- Mock-only helpers ---

function getTransferPrefix(transferType) {
  if (transferType === "outbound") return "TO"
  if (transferType === "return") return "TR"
  if (transferType === "warehouse_transfer") return "TW"
  return "T"
}

function generateTransferId(transferType) {
  const prefix = getTransferPrefix(transferType)

  const matchingIds = mockTransfers
    .filter((transfer) => transfer.id.startsWith(`${prefix}-`))
    .map((transfer) => {
      const numericPart = Number(transfer.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber = matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

/**
 * Maps a Supabase transfer row with nested transfer_items + inventory_items
 * into the frontend shape with a flat items array.
 */
function mapTransferRow(row) {
  const rawItems = row.transfer_items || []
  const { transfer_items, ...rest } = row
  const converted = snakeToCamel(rest)

  converted.items = rawItems.map((item) => {
    const inv = item.inventory_items || {}
    return {
      id: item.id,
      inventoryItemId: item.inventory_item_id,
      name: inv.name || '',
      sku: inv.sku || '',
      unit: inv.unit || '',
      manifestQuantity: item.manifest_quantity,
      shippedQuantity: item.shipped_quantity,
      receivedQuantity: item.received_quantity,
      varianceReason: item.variance_reason || '',
    }
  })

  return converted
}

/**
 * Fetches transfers from Supabase with nested items + inventory details.
 */
async function fetchTransfersWithItems(query) {
  const { data, error } = await query.select(`
    *,
    transfer_items (
      id, inventory_item_id, manifest_quantity,
      shipped_quantity, received_quantity, variance_reason,
      inventory_items (name, sku, unit)
    )
  `)

  if (error) throw new Error(error.message)
  if (!data) return []

  const rows = Array.isArray(data) ? data : [data]
  return rows.map(mapTransferRow)
}

/**
 * Returns all transfers.
 */
export async function getAllTransfers() {
  if (USE_MOCK) return mockTransfers

  return fetchTransfersWithItems(
    supabase.from('transfers_view').order('created_at', { ascending: false })
  )
}

/**
 * Finds a single transfer by ID.
 */
export async function findTransferById(id) {
  if (USE_MOCK) return getTransferById(id)

  const results = await fetchTransfersWithItems(
    supabase.from('transfers_view').eq('id', id)
  )
  return results?.[0] || null
}

/**
 * Returns active transfers (ready_to_ship or in_transit) the user has permission for.
 */
export async function getTransfersForPermissions(permissions = []) {
  if (USE_MOCK) {
    return mockTransfers.filter((transfer) => {
      const statusValue = transfer.statusValue || transfer.status
      if (!ACTIVE_STATUSES.includes(statusValue)) return false

      const requiredPermission = transferPermissionMap[transfer.transferType]
      return requiredPermission ? permissions.includes(requiredPermission) : false
    })
  }

  const results = await fetchTransfersWithItems(
    supabase.from('transfers_view').in('status_value', ACTIVE_STATUSES).order('created_at', { ascending: false })
  )

  return results.filter((transfer) => {
    const requiredPermission = transferPermissionMap[transfer.transferType]
    return requiredPermission ? permissions.includes(requiredPermission) : false
  })
}

/**
 * Creates a new transfer with its line items.
 * Expects camelCase input matching the mock data shape.
 */
export async function createTransfer(newTransfer) {
  if (USE_MOCK) {
    const transferTypeValue = newTransfer.transferTypeValue || newTransfer.transferType

    const transferWithId = {
      ...newTransfer,
      id: generateTransferId(transferTypeValue),
      transferTypeValue,
      transferType: newTransfer.transferType || transferTypeValue,
      statusValue: newTransfer.statusValue || "in_transit",
      status: newTransfer.status || "In Transit",
      completionOutcomeValue: newTransfer.completionOutcomeValue ?? null,
      completionOutcome: newTransfer.completionOutcome ?? null,
    }

    mockTransfers.unshift(transferWithId)
    return transferWithId
  }

  const { items, ...transferFields } = newTransfer
  const snakeFields = camelToSnake(transferFields)

  // Remove display-only fields that only exist on the view
  delete snakeFields.status
  delete snakeFields.transfer_type
  delete snakeFields.location
  delete snakeFields.project
  delete snakeFields.source_location
  delete snakeFields.destination_location
  delete snakeFields.completion_outcome

  const { data: transfer, error } = await supabase
    .from('transfers')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Insert transfer items
  if (items && items.length > 0) {
    const itemRows = items.map((item, index) => ({
      id: `${transfer.id}-${index + 1}`,
      transfer_id: transfer.id,
      inventory_item_id: item.inventoryItemId,
      manifest_quantity: item.manifestQuantity,
      shipped_quantity: item.shippedQuantity ?? null,
      received_quantity: item.receivedQuantity ?? null,
      variance_reason: item.varianceReason || '',
    }))

    const { error: itemsError } = await supabase
      .from('transfer_items')
      .insert(itemRows)

    if (itemsError) throw new Error(itemsError.message)
  }

  return findTransferById(transfer.id)
}

/**
 * Updates a transfer's fields by ID.
 */
export async function updateTransfer(id, updates) {
  if (USE_MOCK) {
    const index = mockTransfers.findIndex((transfer) => transfer.id === id)
    if (index === -1) return null

    mockTransfers[index] = {
      ...mockTransfers[index],
      ...updates,
    }

    return mockTransfers[index]
  }

  const { items, ...fieldUpdates } = updates
  const snakeUpdates = camelToSnake(fieldUpdates)

  // Remove display-only fields
  delete snakeUpdates.status
  delete snakeUpdates.transfer_type
  delete snakeUpdates.location
  delete snakeUpdates.project
  delete snakeUpdates.source_location
  delete snakeUpdates.destination_location

  const { error } = await supabase
    .from('transfers')
    .update(snakeUpdates)
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Update transfer items if provided (e.g., received quantities)
  if (items && items.length > 0) {
    for (const item of items) {
      const itemUpdates = {}
      if (item.shippedQuantity !== undefined) itemUpdates.shipped_quantity = item.shippedQuantity
      if (item.receivedQuantity !== undefined) itemUpdates.received_quantity = item.receivedQuantity
      if (item.varianceReason !== undefined) itemUpdates.variance_reason = item.varianceReason

      if (Object.keys(itemUpdates).length > 0) {
        const { error: itemError } = await supabase
          .from('transfer_items')
          .update(itemUpdates)
          .eq('id', item.id)

        if (itemError) throw new Error(itemError.message)
      }
    }
  }

  return findTransferById(id)
}

/**
 * Deletes a transfer by ID.
 */
export async function deleteTransfer(id) {
  if (USE_MOCK) {
    const index = mockTransfers.findIndex((transfer) => transfer.id === id)
    if (index === -1) return null

    mockTransfers.splice(index, 1)
    return true
  }

  const { error } = await supabase
    .from('transfers')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return true
}
