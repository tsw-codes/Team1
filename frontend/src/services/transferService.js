import { mockTransfers, getTransferById } from "../data/mockTransfers"

const transferPermissionMap = {
    outbound: "transfer_to_job_site",
    return: "transfer_to_warehouse",
    warehouse_transfer: "transfer_to_warehouse",
}

const ACTIVE_STATUSES = ["ready_to_ship", "in_transit"] 

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

export function getAllTransfers() {
    return mockTransfers
}

export function findTransferById(id) {
    return getTransferById(id)
}

export function getTransfersForPermissions(permissions = []) {
    return mockTransfers.filter((transfer) => {
        const statusValue = transfer.statusValue || transfer.status
        if (!ACTIVE_STATUSES.includes(statusValue)) return false
        
        const requiredPermission = transferPermissionMap[transfer.transferType]
        return requiredPermission ? permissions.includes(requiredPermission) : false
    })
}

export function createTransfer(newTransfer) {
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

export function updateTransfer(id, updates) {
    const index = mockTransfers.findIndex((transfer) => transfer.id === id)

    if (index === -1) return null
    
    mockTransfers[index] = {
        ...mockTransfers[index],
        ...updates,
    }

    return mockTransfers[index]
}

export function deleteTransfer(id) {
    const index = mockTransfers.findIndex((transfer) => transfer.id === id)

    if (index === -1) return null
    
    mockTransfers.splice(index, 1)
    return true
}