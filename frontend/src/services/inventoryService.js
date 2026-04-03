import {
  mockInventory,
  requestableInventory,
  warehouseNames,
  getWarehouseFromLocation,
} from "../data/mockInventory"

export function getAllInventory() {
  return mockInventory
}

export function getInventoryItems() {
  return mockInventory
}

export function getRequestableInventory() {
  return requestableInventory
}

export function getWarehouseOptions() {
  return warehouseNames
}

export function getRequestableInventoryForWarehouse(sourceWarehouse) {
  if (!sourceWarehouse) return []

  return requestableInventory.filter((item) => getWarehouseFromLocation(item.location) === sourceWarehouse)
}

export function findRequestableInventoryItemById(id) {
  return requestableInventory.find((item) => String(item.id) === String(id)) || null
}

export function findInvntoryItembyId(id) {
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

export function getInventoryForReturnSource(sourceLocation) {
  if (!sourceLocation) return []
  return mockInventory.filter((item) => item.location.startsWith(sourceLocation))
}

export function getInventoryForWarehouseSource(sourceLocation) {
  if (!sourceLocation) return []
  return requestableInventory.filter(
    (item) => getWarehouseFromLocation(item.location) === sourceLocation
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