import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel } from '../utils/caseUtils'
import { mockInventory } from "../data/mockInventory"
import { mockInventoryAdjustments } from "../data/mockInventoryAdjustements"
import { createAuditTimestamp } from "../utils/dateUtils"
import { getLocationByValue, getProjectOptionsForLocation } from "./projectService"
import { matchOrCreateMaterial } from "./materialService"
import { findPurchaseOrderById } from "./purchaseOrderService"

let inventoryListeners = []

export function subscribeToInventory(listener) {
  inventoryListeners.push(listener)

  return () => {
    inventoryListeners = inventoryListeners.filter((l) => l !== listener)
  }
}

function notifyInventoryChange() {
  inventoryListeners.forEach((listener) => listener())
}

/* =========================
   MOCK DATA SOURCE (mock mode only)
========================= */

const inventoryDataSource = {
  getAll() {
    return mockInventory
  },

  findById(id) {
    return (
      mockInventory.find((item) => String(item.id) === String(id)) || null
    )
  },

  replaceById(id, updatedItem) {
    const index = mockInventory.findIndex(
      (item) => String(item.id) === String(id)
    )

    if (index === -1) return null

    mockInventory[index] = updatedItem
    return mockInventory[index]
  },

  insert(item) {
    mockInventory.unshift(item)
    return item
  },
}

/* =========================
   PURE HELPERS
========================= */

function isWarehouseInventoryItem(item) {
  if (!item?.locationValue) return false
  // Warehouse location values follow the pattern WH-A, WH-B, etc.
  return String(item.locationValue).startsWith("WH-")
}

function isRequestableInventoryItem(item) {
  if (!item) return false
  if (!isWarehouseInventoryItem(item)) return false
  if (item.status === "In Transit") return false
  if (Number(item.quantity || 0) <= 0) return false
  return true
}

function getInventoryStatusFromQuantity(quantity) {
  if (quantity <= 0) return "Out of Stock"
  if (quantity <= 10) return "Low Stock"
  return "Available"
}

function generateInventoryId() {
  const numericIds = mockInventory
    .map((item) => Number(item.id))
    .filter((id) => !Number.isNaN(id))

  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase()
}

async function getWarehouseLocationValues() {
  const { data, error } = await supabase
    .from('locations')
    .select('value')
    .eq('type', 'warehouse')

  if (error) throw new Error('Failed to load warehouse locations.')
  return data.map((l) => l.value)
}

/* =========================
   READ FUNCTIONS (async)
========================= */

export async function getAllInventory() {
  if (USE_MOCK) return mockInventory

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .order('id')

  if (error) throw new Error('Failed to load inventory.')
  return snakeToCamel(data)
}

export async function getInventoryItems() {
  return getAllInventory()
}

export async function getRequestableInventory() {
  if (USE_MOCK) {
    return mockInventory.filter((item) => isRequestableInventoryItem(item))
  }

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

export async function getRequestableInventoryForWarehouse(sourceWarehouseValue) {
  if (!sourceWarehouseValue) return []

  if (USE_MOCK) {
    return mockInventory.filter(
      (item) =>
        isRequestableInventoryItem(item) &&
        item.locationValue === sourceWarehouseValue
    )
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('location_value', sourceWarehouseValue)
    .order('id')

  if (error) throw new Error('Failed to load warehouse inventory.')
  return snakeToCamel(data)
}

export async function findRequestableInventoryItemById(id) {
  if (USE_MOCK) {
    return (
      mockInventory.find(
        (item) => String(item.id) === String(id) && isRequestableInventoryItem(item)
      ) || null
    )
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

export async function getInventoryFilterOptions() {
  const items = USE_MOCK ? mockInventory : await getAllInventory()
  return {
    projects: ["All", ...new Set(items.map((item) => item.project))],
    categories: ["All", ...new Set(items.map((item) => item.category))],
    statuses: ["All", ...new Set(items.map((item) => item.status))],
  }
}

export async function getInventorySummary() {
  const items = USE_MOCK ? mockInventory : await getAllInventory()
  return {
    totalItems: items.length,
    lowStock: items.filter((item) => item.status === "Low Stock").length,
    outOfStock: items.filter((item) => item.status === "Out of Stock").length,
    inTransit: items.filter((item) => item.status === "In Transit").length,
  }
}

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

export async function getInventoryForWarehouseSource(sourceLocationValue) {
  if (!sourceLocationValue) return []

  if (USE_MOCK) {
    return mockInventory.filter(
      (item) =>
        isRequestableInventoryItem(item) &&
        item.locationValue === sourceLocationValue
    )
  }

  const { data, error } = await supabase
    .from('inventory_view')
    .select('*')
    .eq('location_value', sourceLocationValue)
    .order('id')

  if (error) throw new Error('Failed to load warehouse inventory.')
  return snakeToCamel(data)
}

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

/* =========================
   RECEIPT / TRANSFER MOCK HELPERS
   (only used in mock mode — DB triggers handle this in Supabase mode)
========================= */

function getReceiptLineMatchKey(line, materialId = "") {
  return {
    materialId: String(materialId || ""),
    sku: normalizeString(line.sku),
    materialName: normalizeString(line.materialName),
    locationValue: String(line.locationValue || ""),
    projectValue: String(line.projectValue || ""),
  }
}

function findInventoryRecordForReceiptLine(line, materialId = "") {
  const matchKey = getReceiptLineMatchKey(line, materialId)

  return (
    inventoryDataSource.getAll().find((item) => {
      const sameLocation = String(item.locationValue || "") === matchKey.locationValue
      const sameProject = String(item.projectValue || "") === matchKey.projectValue

      if (!sameLocation || !sameProject) return false

      const itemMaterialId = String(item.materialId || "")
      const itemSku = normalizeString(item.sku)
      const itemName = normalizeString(item.name)

      if (matchKey.materialId && itemMaterialId === matchKey.materialId) return true
      if (matchKey.sku && itemSku === matchKey.sku) return true
      if (!matchKey.sku && matchKey.materialName && itemName === matchKey.materialName) return true

      return false
    }) || null
  )
}

function findPurchaseOrderLineUnitCost(receipt, line) {
  if (!receipt?.purchaseOrderId) return 0

  const purchaseOrder = findPurchaseOrderById(receipt.purchaseOrderId)
  if (!purchaseOrder?.items?.length) return 0

  const normalizedSku = normalizeString(line.sku)
  const normalizedName = normalizeString(line.materialName)

  const matchingLine =
    purchaseOrder.items.find((poItem) => {
      const poSku = normalizeString(poItem.sku)
      const poName = normalizeString(poItem.materialName)

      if (normalizedSku && poSku === normalizedSku) return true
      if (!normalizedSku && normalizedName && poName === normalizedName) return true

      return false
    }) || null

  return Number(matchingLine?.unitCost || 0)
}

function resolveMaterialForReceiptLine(receipt, line) {
  const seededUnitCost =
    line.source === "purchase_order"
      ? findPurchaseOrderLineUnitCost(receipt, line)
      : 0

  return matchOrCreateMaterial({
    sku: line.sku,
    materialName: line.materialName,
    category: line.category || "",
    unit: line.unit,
    defaultUnitCost: seededUnitCost,
  })
}

function createInventoryRecordFromReceiptLine(receipt, line, material = null) {
  const receivedQuantity = Number(line.receivedQuantity || 0)
  const unitCost = Number(material?.defaultUnitCost || 0)

  const newInventoryRecord = {
    id: generateInventoryId(),
    materialId: material?.id || "",
    name: line.materialName,
    sku: line.sku,
    quantity: receivedQuantity,
    unit: line.unit,
    projectValue: receipt.projectValue,
    project: receipt.project,
    locationValue: receipt.locationValue,
    location: receipt.location,
    status: getInventoryStatusFromQuantity(receivedQuantity),
    category: line.category || material?.category || "",
    updatedAt: createAuditTimestamp(),
    unitCost,
    totalCost: unitCost * receivedQuantity,
  }

  return inventoryDataSource.insert(newInventoryRecord)
}

function updateInventoryRecordFromReceiptLine(existingItem, line, material = null) {
  const receivedQuantity = Number(line.receivedQuantity || 0)
  const previousQuantity = Number(existingItem.quantity || 0)
  const newQuantity = previousQuantity + receivedQuantity

  const unitCost = Number(existingItem.unitCost || material?.defaultUnitCost || 0)

  const updatedItem = {
    ...existingItem,
    materialId: existingItem.materialId || material?.id || "",
    quantity: newQuantity,
    unit: line.unit || existingItem.unit,
    category: line.category || existingItem.category || material?.category || "",
    status: getInventoryStatusFromQuantity(newQuantity),
    updatedAt: createAuditTimestamp(),
    totalCost: unitCost * newQuantity,
  }

  return inventoryDataSource.replaceById(existingItem.id, updatedItem)
}

async function getTransferDestinationProject(transfer) {
  const destinationLocation = await getLocationByValue(transfer?.destinationLocationValue)

  if (!destinationLocation) {
    return {
      projectValue: transfer?.projectValue || "",
      project: transfer?.project || "",
    }
  }

  if (destinationLocation.type === "warehouse") {
    const warehouseProjects = await getProjectOptionsForLocation(destinationLocation.value)
    const warehouseProject = warehouseProjects[0] || null

    return {
      projectValue: warehouseProject?.value || "",
      project: warehouseProject?.label || "",
    }
  }

  return {
    projectValue: transfer?.projectValue || "",
    project: transfer?.project || "",
  }
}

function findInventoryRecordForTransferDestination({
  materialId = "",
  sku = "",
  name = "",
  locationValue = "",
  projectValue = "",
}) {
  const normalizedSku = normalizeString(sku)
  const normalizedName = normalizeString(name)

  return (
    inventoryDataSource.getAll().find((item) => {
      const sameLocation = String(item.locationValue || "") === String(locationValue || "")
      const sameProject = String(item.projectValue || "") === String(projectValue || "")

      if (!sameLocation || !sameProject) return false

      if (materialId && String(item.materialId || "") === String(materialId)) {
        return true
      }

      if (normalizedSku && normalizeString(item.sku) === normalizedSku) {
        return true
      }

      if (!normalizedSku && normalizedName && normalizeString(item.name) === normalizedName) {
        return true
      }

      return false
    }) || null
  )
}

function createInventoryRecordFromTransferReceipt({
  transfer,
  item,
  sourceItem,
  destinationProjectValue,
  destinationProject,
  destinationLocation,
}) {
  const receivedQuantity = Number(item.receivedQuantity || 0)
  const unitCost = Number(sourceItem?.unitCost || 0)

  const newInventoryRecord = {
    id: generateInventoryId(),
    materialId: item.materialId || sourceItem?.materialId || "",
    name: sourceItem?.name || item.name || "",
    sku: sourceItem?.sku || item.sku || "",
    quantity: receivedQuantity,
    unit: sourceItem?.unit || item.unit || "",
    projectValue: destinationProjectValue,
    project: destinationProject,
    locationValue: transfer.destinationLocationValue || "",
    location: destinationLocation,
    status: getInventoryStatusFromQuantity(receivedQuantity),
    category: sourceItem?.category || "",
    updatedAt: createAuditTimestamp(),
    unitCost,
    totalCost: unitCost * receivedQuantity,
  }

  return inventoryDataSource.insert(newInventoryRecord)
}

function updateInventoryRecordFromTransferReceipt(existingItem, item, sourceItem = null) {
  const receivedQuantity = Number(item.receivedQuantity || 0)
  const previousQuantity = Number(existingItem.quantity || 0)
  const newQuantity = previousQuantity + receivedQuantity
  const unitCost = Number(existingItem.unitCost || sourceItem?.unitCost || 0)

  const updatedItem = {
    ...existingItem,
    materialId: existingItem.materialId || item.materialId || sourceItem?.materialId || "",
    name: existingItem.name || sourceItem?.name || item.name || "",
    sku: existingItem.sku || sourceItem?.sku || item.sku || "",
    unit: existingItem.unit || sourceItem?.unit || item.unit || "",
    category: existingItem.category || sourceItem?.category || "",
    quantity: newQuantity,
    status: getInventoryStatusFromQuantity(newQuantity),
    updatedAt: createAuditTimestamp(),
    totalCost: unitCost * newQuantity,
  }

  return inventoryDataSource.replaceById(existingItem.id, updatedItem)
}

/* =========================
   APPLY FUNCTIONS
   In Supabase mode these are no-ops — the database triggers handle inventory updates
   on receipt/ship/receive automatically. In mock mode they mutate the local store.
========================= */

export async function applyReceiptToInventory(receipt) {
  if (!USE_MOCK) {
    // DB trigger handles this when the receipt row is inserted.
    return { updatedItems: [], createdItems: [] }
  }

  if (!receipt?.items?.length) {
    return { updatedItems: [], createdItems: [] }
  }

  const updatedItems = []
  const createdItems = []

  receipt.items.forEach((line) => {
    const receivedQuantity = Number(line.receivedQuantity || 0)
    const material = resolveMaterialForReceiptLine(receipt, line)

    const lineWithContext = {
      ...line,
      locationValue: receipt.locationValue,
      projectValue: receipt.projectValue,
    }

    const existingItem = findInventoryRecordForReceiptLine(
      lineWithContext,
      material?.id || ""
    )

    if (existingItem) {
      const updatedItem = updateInventoryRecordFromReceiptLine(existingItem, line, material)
      if (updatedItem) updatedItems.push(updatedItem)
      return
    }

    if (receivedQuantity > 0) {
      const createdItem = createInventoryRecordFromReceiptLine(receipt, line, material)
      if (createdItem) createdItems.push(createdItem)
    }
  })

  if (updatedItems.length > 0 || createdItems.length > 0) {
    notifyInventoryChange()
  }

  return { updatedItems, createdItems }
}

export async function applyTransferShipmentToInventory(transfer) {
  if (!USE_MOCK) {
    // DB trigger decrements source inventory when transfer status → in_transit.
    return { updatedItems: [] }
  }

  if (!transfer?.items?.length) {
    return { updatedItems: [] }
  }

  const updatedItems = []

  transfer.items.forEach((item) => {
    const sourceItem = inventoryDataSource.findById(item.inventoryItemId)
    if (!sourceItem) return

    const shippedQuantity = Number(item.shippedQuantity || 0)
    const previousQuantity = Number(sourceItem.quantity || 0)
    const newQuantity = Math.max(0, previousQuantity - shippedQuantity)

    const updatedItem = {
      ...sourceItem,
      quantity: newQuantity,
      status: getInventoryStatusFromQuantity(newQuantity),
      updatedAt: createAuditTimestamp(),
      totalCost: Number(sourceItem.unitCost || 0) * newQuantity,
    }

    const result = inventoryDataSource.replaceById(sourceItem.id, updatedItem)
    if (result) updatedItems.push(result)
  })

  if (updatedItems.length > 0) {
    notifyInventoryChange()
  }

  return { updatedItems }
}

export async function applyTransferReceiptToInventory(transfer) {
  if (!USE_MOCK) {
    // DB trigger increments destination inventory when transfer status → completed/exception.
    return { updatedItems: [], createdItems: [] }
  }

  if (!transfer?.items?.length) {
    return { updatedItems: [], createdItems: [] }
  }

  const destinationLocationRecord = await getLocationByValue(transfer.destinationLocationValue)
  const destinationLocation = destinationLocationRecord?.label || transfer.destinationLocation || ""

  const {
    projectValue: destinationProjectValue,
    project: destinationProject,
  } = await getTransferDestinationProject(transfer)

  const updatedItems = []
  const createdItems = []

  for (const item of transfer.items) {
    const receivedQuantity = Number(item.receivedQuantity || 0)
    if (receivedQuantity <= 0) continue

    const sourceItem = inventoryDataSource.findById(item.inventoryItemId)

    const existingDestinationItem = findInventoryRecordForTransferDestination({
      materialId: item.materialId || sourceItem?.materialId || "",
      sku: item.sku || sourceItem?.sku || "",
      name: item.name || sourceItem?.name || "",
      locationValue: transfer.destinationLocationValue || "",
      projectValue: destinationProjectValue,
    })

    if (existingDestinationItem) {
      const updatedItem = updateInventoryRecordFromTransferReceipt(
        existingDestinationItem,
        item,
        sourceItem
      )
      if (updatedItem) updatedItems.push(updatedItem)
      continue
    }

    const createdItem = createInventoryRecordFromTransferReceipt({
      transfer,
      item,
      sourceItem,
      destinationProjectValue,
      destinationProject,
      destinationLocation,
    })

    if (createdItem) createdItems.push(createdItem)
  }

  if (updatedItems.length > 0 || createdItems.length > 0) {
    notifyInventoryChange()
  }

  return { updatedItems, createdItems }
}

/* =========================
   ADJUSTMENTS
========================= */

function generateAdjustmentId() {
  const prefix = "ADJ"

  const matchingIds = mockInventoryAdjustments
    .filter((adjustment) => adjustment.id.startsWith(`${prefix}-`))
    .map((adjustment) => {
      const numericPart = Number(adjustment.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
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
    const item = inventoryDataSource.findById(inventoryItemId)
    if (!item) return null

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

    const updatedItem = {
      ...item,
      quantity: newQuantity,
      totalCost: Number(item.unitCost || 0) * newQuantity,
      status: getInventoryStatusFromQuantity(newQuantity),
      updatedAt: adjustedAt,
    }

    inventoryDataSource.replaceById(item.id, updatedItem)

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

    notifyInventoryChange()

    return { updatedItem, adjustmentRecord }
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

  notifyInventoryChange()

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
