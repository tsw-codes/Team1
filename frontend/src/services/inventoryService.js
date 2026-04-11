import {
  mockInventory,
  requestableInventory,
} from "../data/mockInventory"

import { mockInventoryAdjustments } from "../data/mockInventoryAdjustements"
import { createAuditTimestamp } from "../utils/dateUtils"
import { getLocationByValue } from "./projectService"

function isWarehouseInventoryItem(item) {
  if (!item.locationValue) return false

  const location = getLocationByValue(item.locationValue)
  return location?.type === "warehouse"
}

function isSiteInventoryItem(item) {
  if (!item.locationValue) return false

  const location = getLocationByValue(item.locationValue)
  return location?.type === "site"
}

export function getAllInventory() {
  return mockInventory
}

export function getInventoryItems() {
  return mockInventory
}

export function getRequestableInventory() {
  return requestableInventory
}

export function getRequestableInventoryForWarehouse(sourceWarehouseValue) {
  if (!sourceWarehouseValue) return []

  return requestableInventory.filter((item) => item.locationValue === sourceWarehouseValue)
}

export function findRequestableInventoryItemById(id) {
  return requestableInventory.find((item) => String(item.id) === String(id)) || null
}

export function findInventoryItemById(id) {
  return mockInventory.find((item) => String(item.id) === String(id)) || null
}

export function getInventoryFilterOptions() {
  return {
    projects: ["All", ...new Set(mockInventory.map((item) => item.project))],
    categories: ["All", ...new Set(mockInventory.map((item) => item.category))],
    statuses: ["All", ...new Set(mockInventory.map((item) => item.status))],
  }
}

export function getInventorySummary() {
  return {
    totalItems: mockInventory.length,
    lowStock: mockInventory.filter((item) => item.status === "Low Stock").length,
    outOfStock: mockInventory.filter((item) => item.status === "Out of Stock").length,
    inTransit: mockInventory.filter((item) => item.status === "In Transit").length,
  }
}

export function getInventoryForReturnSource(sourceLocationValue) {
  if (!sourceLocationValue) return []
  return mockInventory.filter((item) => item.locationValue === sourceLocationValue)
}

export function getInventoryForWarehouseSource(sourceLocationValue) {
  if (!sourceLocationValue) return []
  
  return requestableInventory.filter(
    (item) => item.locationValue === sourceLocationValue
  )
}

export function getManualSourceInventory(manifestMode, sourceLocation) {
  if (!sourceLocation) return []

  if (manifestMode === "return") {
    return getInventoryForReturnSource(sourceLocation)
  }

  if (manifestMode === "warehouse_transfer") {
    return getInventoryForWarehouseSource(sourceLocation)
  }

  return []
}

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

export function createInventoryAdjustment({
  inventoryItemId,
  adjustmentType,
  quantityValue,
  reason,
  adjustedBy,
  permissions = [],
}) {
  const index = mockInventory.findIndex((item) => String(item.id) === String(inventoryItemId))

  if (index === -1) return null

  const item = mockInventory[index]
  
  if (!canAdjustInventoryItemForPermissions(item, permissions)) {
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

export function canAdjustInventoryItemForPermissions(item, permissions = []) {
  if (!item) return false
  if (item.status === "In Transit") return false

  const canAdjustWarehouse = permissions.includes("adjust_inventory_warehouse")
  const canAdjustSite = permissions.includes("adjust_inventory_site")

  if (isWarehouseInventoryItem(item)) return canAdjustWarehouse
  if (isSiteInventoryItem(item)) return canAdjustSite

  return false
}