import { mockManifests } from "../data/mockManifests"
import { createAuditTimestamp } from "../utils/dateUtils"
import {
  getSiteLocationOptions,
  getWarehouseLocationOptions,
} from "./projectService"

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

const manifestDataSource = {
  getAll() {
    return mockManifests
  },

  findById(id) {
    return mockManifests.find((manifest) => manifest.id === id) || null
  },

  insert(manifest) {
    mockManifests.unshift(manifest)
    return manifest
  },

  replaceById(id, updatedManifest) {
    const index = mockManifests.findIndex((manifest) => manifest.id === id)

    if (index === -1) return null

    mockManifests[index] = updatedManifest
    return mockManifests[index]
  },
}

let manifestListeners = []

export function subscribeToManifests(listener) {
  manifestListeners.push(listener)

  return () => {
    manifestListeners = manifestListeners.filter((l) => l !== listener)
  }
}

function notifyManifestChange() {
  manifestListeners.forEach((listener) => listener())
}

function getManifestPrefix(manifestType) {
  if (manifestType === "outbound") return "MO"
  if (manifestType === "return") return "MR"
  if (manifestType === "warehouse_transfer") return "MW"
  return "M"
}

function generateManifestId(manifestType) {
  const prefix = getManifestPrefix(manifestType)

  const matchingIds = manifestDataSource
    .getAll()
    .filter((manifest) => manifest.id.startsWith(`${prefix}-`))
    .map((manifest) => {
      const numericPart = Number(manifest.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

export function getAllManifests() {
  return manifestDataSource.getAll()
}

export function findManifestById(id) {
  return manifestDataSource.findById(id)
}

export function getAllowedManifestModes(permissions = []) {
  return Object.keys(manifestPermissionMap).filter((mode) =>
    permissions.includes(manifestPermissionMap[mode])
  )
}

export function getAllowedSourceLocations(manifestMode) {
  if (manifestMode === "return") {
    return getSiteLocationOptions()
  }

  if (manifestMode === "warehouse_transfer") {
    return getWarehouseLocationOptions()
  }

  if (manifestMode === "outbound") {
    return getWarehouseLocationOptions()
  }

  return []
}

export function getAllowedDestinationLocations(manifestMode) {
  if (manifestMode === "return") {
    return getWarehouseLocationOptions()
  }

  if (manifestMode === "warehouse_transfer") {
    return getWarehouseLocationOptions()
  }

  if (manifestMode === "outbound") {
    return getSiteLocationOptions()
  }

  return []
}

export function getAvailableManifestsForTransfer(permissions = []) {
  return manifestDataSource.getAll().filter((manifest) => {
    if ((manifest.statusValue || manifest.status) !== "finalized") return false

    const requiredPermission = transferPermissionMap[manifest.manifestType]
    return requiredPermission ? permissions.includes(requiredPermission) : false
  })
}

export function buildManifestPayload({
  manifestMode,
  manifestForm,
  editableManifestItems,
  selectedSourceLocation,
  selectedDestinationLocation,
  requestableInventoryItems,
  manualSourceInventory,
  currentUser,
}) {
  const finalizedAt = createAuditTimestamp()
  const finalizedBy = currentUser?.username || "unknown"

  return {
    manifestTypeValue: manifestMode,
    manifestType: manifestMode,
    statusValue: "finalized",
    status: "Finalized",

    requestId: manifestForm.requestId,
    requestedBy: manifestForm.requestedBy,
    approvedBy: manifestForm.approvedBy,
    approvedAt: manifestForm.approvedAt,

    createdBy: manifestForm.createdBy,
    createdAt: manifestForm.createdAt,

    manifestDate: manifestForm.manifestDate,

    locationValue: manifestForm.locationValue,
    location: manifestForm.location,
    projectValue: manifestForm.projectValue,
    project: manifestForm.project,

    finalizedBy,
    finalizedAt,

    sourceLocationValue: manifestForm.sourceLocationValue,
    sourceLocation: selectedSourceLocation?.label || "",

    destinationLocationValue: manifestForm.destinationLocationValue,
    destinationLocation: selectedDestinationLocation?.label || "",
    destinationDetail: manifestForm.destinationDetail || "",

    notes: manifestForm.notes,

    items: editableManifestItems.map((item) => {
      const inventoryItem =
        manifestMode === "outbound"
          ? requestableInventoryItems.find(
              (inventory) => inventory.id === item.inventoryItemId
            )
          : manualSourceInventory.find(
              (inventory) => String(inventory.id) === String(item.inventoryItemId)
            )

      return {
        id: item.id,
        inventoryItemId: Number(item.inventoryItemId),
        materialId: inventoryItem?.materialId || "",
        name: inventoryItem?.name || "",
        sku: inventoryItem?.sku || "",
        unit: inventoryItem?.unit || "",
        manifestQuantity: Number(item.manifestQuantity || 0),
      }
    }),
  }
}

export function createManifest(newManifest) {
  const manifestWithId = { 
    ...newManifest, 
    id: generateManifestId(newManifest.manifestTypeValue || newManifest.manifestType),
    manifestTypeValue: newManifest.manifestTypeValue || newManifest.manifestType,
    manifestType: newManifest.manifestType || newManifest.manifestTypeValue,
    statusValue: newManifest.statusValue || "finalized",
    status: newManifest.status || "Finalized",
  }

  const createdManifest = manifestDataSource.insert(manifestWithId)
  notifyManifestChange()
  return createdManifest
}

export function updateManifest(id, updates) {
  const existingManifest = manifestDataSource.findById(id)
  if (!existingManifest) return null

  const updatedManifest = {
    ...existingManifest,
    ...updates,
  }

  const result = manifestDataSource.replaceById(id, updatedManifest)
  notifyManifestChange()
  return result
}