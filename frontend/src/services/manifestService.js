import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockManifests, getManifestById } from "../data/mockManifests"

const manifestPermissionMap = {
  outbound: "create_outbound_manifest",
  return: "create_return_manifest",
  warehouse_transfer: "create_warehouse_transfer_manifest",
}

const transferPermissionMap = {
  outbound: "transfer_to_job_site",
  return: "transfer_to_warehouse",
  warehouse_transfer: "transfer_to_warehouse",
}

// --- Mock-only helpers ---

function getManifestPrefix(manifestType) {
  if (manifestType === "outbound") return "MO"
  if (manifestType === "return") return "MR"
  if (manifestType === "warehouse_transfer") return "MW"
  return "M"
}

function generateManifestId(manifestType) {
  const prefix = getManifestPrefix(manifestType)

  const matchingIds = mockManifests
    .filter((manifest) => manifest.id.startsWith(`${prefix}-`))
    .map((manifest) => {
      const numericPart = Number(manifest.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber = matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

/**
 * Maps a Supabase manifest row with nested manifest_items + inventory_items
 * into the frontend shape with a flat items array.
 */
function mapManifestRow(row) {
  const rawItems = row.manifest_items || []
  const { manifest_items, ...rest } = row
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
    }
  })

  return converted
}

const MANIFEST_SELECT = '*, manifest_items (id, inventory_item_id, manifest_quantity, inventory_items (name, sku, unit))'

function mapManifestRows(data) {
  if (!data) return []
  const rows = Array.isArray(data) ? data : [data]
  return rows.map(mapManifestRow)
}

/**
 * Returns all manifests.
 */
export async function getAllManifests() {
  if (USE_MOCK) return mockManifests

  const { data, error } = await supabase
    .from('manifests_view')
    .select(MANIFEST_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapManifestRows(data)
}

/**
 * Finds a single manifest by ID.
 */
export async function findManifestById(id) {
  if (USE_MOCK) return getManifestById(id)

  const { data, error } = await supabase
    .from('manifests_view')
    .select(MANIFEST_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  return mapManifestRows(data)?.[0] || null
}

/**
 * Returns which manifest modes the user's permissions allow.
 * Pure permission check — no DB query needed.
 */
export function getAllowedManifestModes(permissions = []) {
  return Object.keys(manifestPermissionMap).filter((mode) =>
    permissions.includes(manifestPermissionMap[mode])
  )
}

/**
 * Returns finalized manifests that the user has permission to create transfers for.
 */
export async function getAvailableManifestsForTransfer(permissions = []) {
  if (USE_MOCK) {
    return mockManifests.filter((manifest) => {
      if ((manifest.statusValue || manifest.status) !== "finalized") return false

      const requiredPermission = transferPermissionMap[manifest.manifestType]
      return requiredPermission ? permissions.includes(requiredPermission) : false
    })
  }

  const { data, error } = await supabase
    .from('manifests_view')
    .select(MANIFEST_SELECT)
    .eq('status_value', 'finalized')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const results = mapManifestRows(data)

  return results.filter((manifest) => {
    const requiredPermission = transferPermissionMap[manifest.manifestType]
    return requiredPermission ? permissions.includes(requiredPermission) : false
  })
}

/**
 * Creates a new manifest with its line items.
 * Expects camelCase input matching the mock data shape.
 */
export async function createManifest(newManifest) {
  if (USE_MOCK) {
    const manifestWithId = {
      ...newManifest,
      id: generateManifestId(newManifest.manifestTypeValue || newManifest.manifestType),
      manifestTypeValue: newManifest.manifestTypeValue || newManifest.manifestType,
      manifestType: newManifest.manifestType || newManifest.manifestTypeValue,
      statusValue: newManifest.statusValue || "finalized",
      status: newManifest.status || "Finalized",
    }

    mockManifests.unshift(manifestWithId)
    return manifestWithId
  }

  const { items, ...manifestFields } = newManifest
  const snakeFields = camelToSnake(manifestFields)

  // Remove display-only fields that only exist on the view
  delete snakeFields.status
  delete snakeFields.manifest_type
  delete snakeFields.location
  delete snakeFields.project
  delete snakeFields.source_location
  delete snakeFields.destination_location

  const { data: manifest, error } = await supabase
    .from('manifests')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Insert manifest items
  if (items && items.length > 0) {
    const itemRows = items.map((item, index) => ({
      id: `${manifest.id}-${index + 1}`,
      manifest_id: manifest.id,
      inventory_item_id: item.inventoryItemId,
      manifest_quantity: item.manifestQuantity,
    }))

    const { error: itemsError } = await supabase
      .from('manifest_items')
      .insert(itemRows)

    if (itemsError) throw new Error(itemsError.message)
  }

  // Re-fetch from view to get joined labels + items
  return findManifestById(manifest.id)
}

/**
 * Updates a manifest's fields by ID.
 */
export async function updateManifest(id, updates) {
  if (USE_MOCK) {
    const index = mockManifests.findIndex((manifest) => manifest.id === id)
    if (index === -1) return null

    mockManifests[index] = {
      ...mockManifests[index],
      ...updates,
    }

    return mockManifests[index]
  }

  const snakeUpdates = camelToSnake(updates)

  // Remove display-only fields
  delete snakeUpdates.status
  delete snakeUpdates.manifest_type
  delete snakeUpdates.location
  delete snakeUpdates.project
  delete snakeUpdates.source_location
  delete snakeUpdates.destination_location
  delete snakeUpdates.items

  const { error } = await supabase
    .from('manifests')
    .update(snakeUpdates)
    .eq('id', id)

  if (error) throw new Error(error.message)

  return findManifestById(id)
}
