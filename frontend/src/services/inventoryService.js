import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel } from '../utils/caseUtils'
import {
  mockInventory,
  requestableInventory,
} from "../data/mockInventory"
import { mockInventoryAdjustments } from "../data/mockInventoryAdjustements"
import { createAuditTimestamp } from "../utils/dateUtils"
import { getLocationByValue } from "./projectService"

/**
 * Returns all warehouse location values (used to filter requestable inventory).
 */
async function getWarehouseLocationValues() {
  const { data, error } = await supabase
    .from('locations')
    .select('value')
    .eq('type', 'warehouse')

  if (error) throw new Error('Failed to load warehouse locations.')
  return data.map((l) => l.value)
}

/**
 * Returns all inventory items.
 */
export async function getAllInventory() {
  if (USE_MOCK) return mockInventory

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .order('id')

  if (error) throw new Error('Failed to load inventory.')
  return snakeToCamel(data)
}

/**
 * Alias for getAllInventory.
 */
export async function getInventoryItems() {
  return getAllInventory()
}

/**
 * Returns inventory items from warehouse locations only (for material requests).
 */
export async function getRequestableInventory() {
  if (USE_MOCK) return requestableInventory

  const warehouseValues = await getWarehouseLocationValues()
  if (warehouseValues.length === 0) return []

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .in('location_value', warehouseValues)
    .order('id')

  if (error) throw new Error('Failed to load requestable inventory.')
  return snakeToCamel(data)
}

/**
 * Returns warehouse inventory filtered to a specific warehouse.
 */
export async function getRequestableInventoryForWarehouse(sourceWarehouseValue) {
  if (!sourceWarehouseValue) return []

  if (USE_MOCK) {
    return requestableInventory.filter((item) => item.locationValue === sourceWarehouseValue)
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('location_value', sourceWarehouseValue)
    .order('id')

  if (error) throw new Error('Failed to load warehouse inventory.')
  return snakeToCamel(data)
}

/**
 * Finds a single requestable (warehouse) inventory item by ID.
 */
export async function findRequestableInventoryItemById(id) {
  if (USE_MOCK) {
    return requestableInventory.find((item) => String(item.id) === String(id)) || null
  }

  const warehouseValues = await getWarehouseLocationValues()
  if (warehouseValues.length === 0) return null

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('id', id)
    .in('location_value', warehouseValues)
    .single()

  if (error) return null
  return snakeToCamel(data)
}

/**
 * Finds any inventory item by ID.
 */
export async function findInventoryItemById(id) {
  if (USE_MOCK) {
    return mockInventory.find((item) => String(item.id) === String(id)) || null
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return snakeToCamel(data)
}

/**
 * Returns unique filter options (projects, categories, statuses) for the inventory page.
 */
export async function getInventoryFilterOptions() {
  if (USE_MOCK) {
    return {
      projects: ["All", ...new Set(mockInventory.map((item) => item.project))],
      categories: ["All", ...new Set(mockInventory.map((item) => item.category))],
      statuses: ["All", ...new Set(mockInventory.map((item) => item.status))],
    }
  }

  const items = await getAllInventory()
  return {
    projects: ["All", ...new Set(items.map((item) => item.project))],
    categories: ["All", ...new Set(items.map((item) => item.category))],
    statuses: ["All", ...new Set(items.map((item) => item.status))],
  }
}

/**
 * Returns inventory summary counts by status.
 */
export async function getInventorySummary() {
  if (USE_MOCK) {
    return {
      totalItems: mockInventory.length,
      lowStock: mockInventory.filter((item) => item.status === "Low Stock").length,
      outOfStock: mockInventory.filter((item) => item.status === "Out of Stock").length,
      inTransit: mockInventory.filter((item) => item.status === "In Transit").length,
    }
  }

  const items = await getAllInventory()
  return {
    totalItems: items.length,
    lowStock: items.filter((item) => item.status === "Low Stock").length,
    outOfStock: items.filter((item) => item.status === "Out of Stock").length,
    inTransit: items.filter((item) => item.status === "In Transit").length,
  }
}

/**
 * Returns inventory at a specific location (used for return manifests).
 */
export async function getInventoryForReturnSource(sourceLocationValue) {
  if (!sourceLocationValue) return []

  if (USE_MOCK) {
    return mockInventory.filter((item) => item.locationValue === sourceLocationValue)
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('location_value', sourceLocationValue)
    .order('id')

  if (error) throw new Error('Failed to load inventory for location.')
  return snakeToCamel(data)
}

/**
 * Returns warehouse inventory at a specific location (used for warehouse transfer manifests).
 */
export async function getInventoryForWarehouseSource(sourceLocationValue) {
  if (!sourceLocationValue) return []

  if (USE_MOCK) {
    return requestableInventory.filter((item) => item.locationValue === sourceLocationValue)
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('location_value', sourceLocationValue)
    .order('id')

  if (error) throw new Error('Failed to load warehouse inventory.')
  return snakeToCamel(data)
}

/**
 * Returns source inventory for a manifest based on mode and location.
 */
export async function getManualSourceInventory(manifestMode, sourceLocation) {
  if (!sourceLocation) return []

  if (manifestMode === "return") {
    return getInventoryForReturnSource(sourceLocation)
  }

  if (manifestMode === "warehouse_transfer") {
    return getInventoryForWarehouseSource(sourceLocation)
  }

  return []
}

// --- Mock-only helpers (used only when USE_MOCK is true) ---

function generateAdjustmentId() {
  const prefix = "ADJ"

  const matchingIds = mockInventoryAdjustments
    .filter((adjustment) => adjustment.id.startsWith(`${prefix}-`))
    .map((adjustment) => {
      const numericPart = Number(adjustment.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber = matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

function getInventoryStatusFromQuantity(quantity) {
  if (quantity <= 0) return "Out of Stock"
  if (quantity <= 10) return "Low Stock"
  return "Available"
}

/**
 * Creates an inventory adjustment (increase, decrease, or set).
 * Mock mode: mutates local arrays. Supabase mode: calls the atomic RPC.
 * Returns { updatedItem, adjustmentRecord } or null.
 */
export async function createInventoryAdjustment({
  inventoryItemId,
  adjustmentType,
  quantityValue,
  reason,
  adjustedBy,
  permissions = [],
}) {
  if (USE_MOCK) {
    const index = mockInventory.findIndex((item) => String(item.id) === String(inventoryItemId))
    if (index === -1) return null

    const item = mockInventory[index]

    if (!(await canAdjustInventoryItemForPermissions(item, permissions))) {
      return null
    }

    const previousQuantity = Number(item.quantity || 0)
    const numericValue = Number(quantityValue || 0)

    if (!adjustmentType || numericValue < 0 || !reason?.trim()) {
      return null
    }

    let newQuantity = previousQuantity
    let quantityChange = 0

    if (adjustmentType === "increase") {
      newQuantity = previousQuantity + numericValue
      quantityChange = numericValue
    }

    if (adjustmentType === "decrease") {
      newQuantity = previousQuantity - numericValue
      quantityChange = -numericValue
    }

    if (adjustmentType === "set") {
      newQuantity = numericValue
      quantityChange = numericValue - previousQuantity
    }

    if (newQuantity < 0) return null

    const adjustedAt = createAuditTimestamp()

    mockInventory[index] = {
      ...item,
      quantity: newQuantity,
      totalCost: Number(item.unitCost || 0) * newQuantity,
      status: getInventoryStatusFromQuantity(newQuantity),
      updatedAt: adjustedAt,
    }

    const adjustmentRecord = {
      id: generateAdjustmentId(),
      inventoryItemId: item.id,
      adjustmentType,
      quantityChange,
      previousQuantity,
      newQuantity,
      reason,
      adjustedBy,
      adjustedAt,
    }

    mockInventoryAdjustments.unshift(adjustmentRecord)

    return {
      updatedItem: mockInventory[index],
      adjustmentRecord,
    }
  }

  // Supabase mode: the RPC handles atomicity, status calc, and audit logging
  const { data, error } = await supabase.rpc('create_inventory_adjustment', {
    p_inventory_item_id: Number(inventoryItemId),
    p_adjustment_type: adjustmentType,
    p_quantity_value: Number(quantityValue),
    p_reason: reason,
    p_adjusted_by: adjustedBy,
  })

  if (error) throw new Error(error.message)

  const updatedItem = await findInventoryItemById(inventoryItemId)

  return {
    updatedItem,
    adjustmentRecord: {
      id: data.adjustmentId,
      inventoryItemId: Number(inventoryItemId),
      adjustmentType,
      quantityChange: data.newQuantity - data.previousQuantity,
      previousQuantity: data.previousQuantity,
      newQuantity: data.newQuantity,
      reason,
      adjustedBy,
      adjustedAt: new Date().toISOString(),
    },
  }
}

/**
 * Checks if a user has permission to adjust a specific inventory item
 * based on its location type (warehouse vs site).
 */
export async function canAdjustInventoryItemForPermissions(item, permissions = []) {
  if (!item) return false
  if (item.status === "In Transit") return false

  const canAdjustWarehouse = permissions.includes("adjust_inventory_warehouse")
  const canAdjustSite = permissions.includes("adjust_inventory_site")

  const location = await getLocationByValue(item.locationValue)
  if (!location) return false

  if (location.type === "warehouse") return canAdjustWarehouse
  if (location.type === "site") return canAdjustSite

  return false
}
