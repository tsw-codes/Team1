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

export function getAllManifests() {
  return mockManifests
}

export function findManifestById(id) {
  return getManifestById(id)
}

export function getAllowedManifestModes(permissions = []) {
  return Object.keys(manifestPermissionMap).filter((mode) =>
    permissions.includes(manifestPermissionMap[mode])
  )
}

export function getAvailableManifestsForTransfer(permissions = []) {
  return mockManifests.filter((manifest) => {
    if ((manifest.statusValue || manifest.status) !== "finalized") return false

    const requiredPermission = transferPermissionMap[manifest.manifestType]
    return requiredPermission ? permissions.includes(requiredPermission) : false
  })
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

  mockManifests.unshift(manifestWithId)
  return manifestWithId
}

export function updateManifest(id, updates) {
  const index = mockManifests.findIndex((manifest) => manifest.id === id)

  if (index === -1) return null

  mockManifests[index] = {
    ...mockManifests[index],
    ...updates,
  }

  return mockManifests[index]
}